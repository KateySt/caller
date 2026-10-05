import {
  BadGatewayException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { autoRetry } from '@grammyjs/auto-retry';
import { Bot, GrammyError, HttpError } from 'grammy';
import { Repository } from 'typeorm';
import { isUniqueViolation } from '../common/postgres.util.js';
import { TelegramMessage } from './entities/telegram-message.entity.js';
import { TelegramUpdate } from './entities/telegram-update.entity.js';
import { TelegramLinkService, deriveStatus } from './telegram-link.service.js';

const REQUEST_TIMEOUT_MS = 10_000;
/** Telegram allows about one message per second per private chat. */
const MIN_SEND_INTERVAL_MS = 1_000;
export const DEFAULT_PAGE_SIZE = 100;
export const MAX_PAGE_SIZE = 500;

export interface TelegramMessagePage {
  messages: TelegramMessage[];
  hasMore: boolean;
}

/**
 * Owns the bot token and every Bot API send (SPEC-04 AC-19, AC-24..AC-31), plus the
 * conversation log. Update handling lives in `TelegramUpdatesService`.
 */
@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);
  private readonly token: string;
  private readonly chatTails = new Map<string, Promise<void>>();

  readonly bot: Bot;

  // Explicit @Inject: this module tree also runs under `tsx`, which emits no DI metadata.
  constructor(
    @Inject(ConfigService) configService: ConfigService,
    @Inject(TelegramLinkService) private readonly linkService: TelegramLinkService,
    @InjectRepository(TelegramMessage)
    private readonly messages: Repository<TelegramMessage>,
    @InjectRepository(TelegramUpdate)
    private readonly updates: Repository<TelegramUpdate>,
  ) {
    this.token = configService.getOrThrow<string>('TELEGRAM_BOT_TOKEN');
    this.bot = new Bot(this.token);

    // Transformers added later wrap earlier ones: the timeout sits inside auto-retry so it
    // bounds each attempt. Long polling (`getUpdates`) manages its own timeout.
    this.bot.api.config.use((prev, method, payload, signal) => {
      if (method === 'getUpdates') {
        return prev(method, payload, signal);
      }
      // grammy's signal comes from the `abort-controller` polyfill, which the native
      // `AbortSignal.any` rejects — so forward its abort to a native controller by hand.
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      const forwardAbort = () => controller.abort();
      if (signal?.aborted) {
        controller.abort();
      } else {
        signal?.addEventListener('abort', forwardAbort, { once: true });
      }

      return prev(method, payload, controller.signal as unknown as typeof signal).finally(() => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', forwardAbort);
      });
    });
    // AC-29: wait the interval Telegram asks for, retry once.
    this.bot.api.config.use(autoRetry({ maxRetryAttempts: 1, maxDelaySeconds: 30 }));
  }

  /** Strips the bot token from anything about to be logged (AC-37). */
  redact(text: string): string {
    return text.split(this.token).join('<bot-token>');
  }

  /** AC-20: false when this update id was already handled. */
  async claimUpdate(updateId: number): Promise<boolean> {
    try {
      await this.updates.insert({ updateId: String(updateId) });
      return true;
    } catch (error) {
      if (isUniqueViolation(error)) {
        return false;
      }
      throw error;
    }
  }

  /** AC-16 / AC-17: `text` null means a non-text placeholder. */
  logInbound(
    userId: string,
    contentType: string,
    text: string | null,
    telegramMessageId: number,
    occurredAt: Date,
  ): Promise<TelegramMessage> {
    return this.messages.save(
      this.messages.create({
        userId,
        direction: 'inbound',
        contentType,
        text,
        status: 'received',
        failureReason: null,
        telegramMessageId: String(telegramMessageId),
        occurredAt,
      }),
    );
  }

  /** AC-21 / AC-23: newest `limit` entries (optionally older than `before`), oldest-first. */
  async listMessages(
    userId: string,
    limit?: number,
    before?: string,
  ): Promise<TelegramMessagePage> {
    const take = Math.min(limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const query = this.messages
      .createQueryBuilder('m')
      .where('m.userId = :userId', { userId })
      .orderBy('m.occurredAt', 'DESC')
      .addOrderBy('m.createdAt', 'DESC')
      .addOrderBy('m.id', 'DESC')
      .take(take + 1);

    if (before) {
      const cursor = await this.messages.findOne({ where: { id: before, userId } });
      if (!cursor) {
        throw new NotFoundException('Cursor message not found');
      }
      query.andWhere('(m.occurredAt, m.createdAt) < (:occurredAt, :createdAt)', {
        occurredAt: cursor.occurredAt,
        createdAt: cursor.createdAt,
      });
    }

    const rows = await query.getMany();
    const hasMore = rows.length > take;

    return { messages: rows.slice(0, take).reverse(), hasMore };
  }

  /** AC-38 */
  async deleteMessages(userId: string): Promise<void> {
    await this.messages.delete({ userId });
  }

  /** AC-24 / AC-27: operator send, only to a linked, opted-in, reachable client. */
  async sendOperatorMessage(userId: string, text: string): Promise<TelegramMessage> {
    const link = await this.linkService.findByUserId(userId);
    const status = deriveStatus(link);

    if (!link || status === 'not_linked') {
      throw new ConflictException('This contact has not linked Telegram yet (not_linked)');
    }
    if (status === 'opted_out') {
      throw new ConflictException('This contact opted out of Telegram messages (opted_out)');
    }
    if (status === 'unreachable') {
      throw new ConflictException('This contact blocked the bot on Telegram (unreachable)');
    }

    return this.deliver(userId, link.chatId, text);
  }

  /**
   * Sends and logs one outbound message (AC-19) without checking opt-out state — callers
   * that need the check go through `sendOperatorMessage`. Throws `BadGatewayException` on failure.
   */
  deliver(userId: string, chatId: string, text: string): Promise<TelegramMessage> {
    return this.runSerialized(chatId, async () => {
      try {
        const sent = await this.bot.api.sendMessage(chatId, text);

        return await this.logOutbound(userId, text, 'sent', null, sent.message_id);
      } catch (error) {
        const failure = this.classifySendError(error);
        // AC-30: full detail server-side only.
        this.logger.error(`Telegram send failed: ${this.redact(describeError(error))}`);

        if (failure.blocked) {
          await this.linkService.markUnreachable(userId); // AC-28
        }
        await this.logOutbound(userId, text, 'failed', failure.reason, null);

        throw new BadGatewayException('Failed to send the Telegram message');
      }
    });
  }

  private logOutbound(
    userId: string,
    text: string,
    status: 'sent' | 'failed',
    failureReason: string | null,
    telegramMessageId: number | null,
  ): Promise<TelegramMessage> {
    return this.messages.save(
      this.messages.create({
        userId,
        direction: 'outbound',
        contentType: 'text',
        text,
        status,
        failureReason,
        telegramMessageId: telegramMessageId === null ? null : String(telegramMessageId),
        occurredAt: new Date(),
      }),
    );
  }

  private classifySendError(error: unknown): { reason: string; blocked: boolean } {
    if (error instanceof GrammyError) {
      if (error.error_code === 403) {
        return { reason: 'The client blocked the bot', blocked: true };
      }
      if (error.error_code === 429) {
        return { reason: 'Telegram rate limit reached', blocked: false };
      }
      return { reason: 'Telegram rejected the message', blocked: false };
    }
    if (error instanceof HttpError) {
      return { reason: 'Could not reach Telegram (timeout or network error)', blocked: false };
    }
    return { reason: 'Unexpected error while sending', blocked: false };
  }

  /** One in-flight send per chat, spaced to respect the per-chat rate limit. */
  private runSerialized<T>(chatId: string, task: () => Promise<T>): Promise<T> {
    const previous = this.chatTails.get(chatId) ?? Promise.resolve();
    const result = previous.then(task);
    const tail = result
      .then(
        () => undefined,
        () => undefined,
      )
      .then(() => new Promise<void>((resolve) => setTimeout(resolve, MIN_SEND_INTERVAL_MS)));

    this.chatTails.set(chatId, tail);
    void tail.then(() => {
      if (this.chatTails.get(chatId) === tail) {
        this.chatTails.delete(chatId);
      }
    });

    return result;
  }
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  return String(error);
}
