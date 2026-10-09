import { Inject, Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { fromUnixTime } from 'date-fns';
import type { Context } from 'grammy';
import { TelegramLinkService } from './telegram-link.service.js';
import { TelegramService } from './telegram.service.js';

const ALLOWED_UPDATES = ['message', 'my_chat_member'] as const;

/** Message keys that identify non-text content, checked in order (AC-17). */
const CONTENT_KINDS = [
  'photo',
  'voice',
  'video',
  'video_note',
  'audio',
  'document',
  'sticker',
  'animation',
  'contact',
  'location',
  'poll',
] as const;

const NOT_LINKED_REPLY =
  'This link is not valid. Please ask the operator who contacted you for a new one.';
const CHAT_CONFLICT_REPLY =
  'This chat is already connected to a different contact, so this link cannot be used here. ' +
  'Please ask the operator for help.';
const STOP_NOT_LINKED_REPLY = 'This chat is not linked to any contact, so there is nothing to stop.';
const ALREADY_LINKED_REPLY =
  'This chat is already linked. You can send /stop at any time to stop receiving messages.';
const STOPPED_REPLY =
  'You will no longer receive messages from this bot. Send /start at any time to turn them back on.';

/**
 * Handles every Telegram update (SPEC-04 AC-8..AC-20, AC-31, AC-33..AC-35). All incoming
 * text is data only: it is stored and echoed back as plain text, never interpreted.
 */
@Injectable()
export class TelegramUpdatesService implements OnApplicationShutdown {
  private readonly logger = new Logger(TelegramUpdatesService.name);
  private readonly webhookUrl: string | undefined;
  private readonly webhookSecret: string | undefined;
  private readonly privacyPolicyUrl: string | undefined;
  private polling = false;

  constructor(
    @Inject(ConfigService) configService: ConfigService,
    @Inject(TelegramService) private readonly telegram: TelegramService,
    @Inject(TelegramLinkService) private readonly links: TelegramLinkService,
  ) {
    this.webhookUrl = configService.get<string>('TELEGRAM_WEBHOOK_URL');
    this.webhookSecret = configService.get<string>('TELEGRAM_WEBHOOK_SECRET');
    this.privacyPolicyUrl = configService.get<string>('TELEGRAM_PRIVACY_POLICY_URL');
    this.registerHandlers();
  }

  get isWebhookMode(): boolean {
    return Boolean(this.webhookUrl);
  }

  /** The secret Telegram echoes in `X-Telegram-Bot-Api-Secret-Token`; undefined in polling mode. */
  get expectedWebhookSecret(): string | undefined {
    return this.isWebhookMode ? this.webhookSecret : undefined;
  }

  /**
   * Called from `main.ts` after the HTTP server is up — not from a lifecycle hook, because
   * only the HTTP server may poll or register a webhook, not every `AppModule` consumer.
   * A bad/revoked token is logged and does not stop the API (spec edge case).
   */
  async start(): Promise<void> {
    if (!this.privacyPolicyUrl) {
      this.logger.warn(
        'TELEGRAM_PRIVACY_POLICY_URL is not set: the greeting is sent without a privacy policy link',
      );
    }

    const { bot } = this.telegram;
    try {
      if (this.webhookUrl) {
        await bot.init();
        await bot.api.setWebhook(this.webhookUrl, {
          secret_token: this.webhookSecret,
          allowed_updates: [...ALLOWED_UPDATES],
        });
        this.logger.log('Telegram webhook mode');
        return;
      }

      // AC-35: never poll while a webhook is registered.
      await bot.api.deleteWebhook();
      this.polling = true;
      void bot
        .start({ allowed_updates: [...ALLOWED_UPDATES] })
        .catch((error: unknown) => this.logFailure('Telegram polling stopped', error))
        .finally(() => {
          this.polling = false;
        });
      this.logger.log('Telegram long-polling mode');
    } catch (error) {
      this.logFailure('Telegram bot failed to start', error);
    }
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.polling) {
      await this.telegram.bot.stop();
    }
  }

  /** Webhook entry point (AC-34): the controller does not await this. */
  async handleWebhookUpdate(update: unknown): Promise<void> {
    try {
      await this.telegram.bot.handleUpdate(update as Parameters<typeof this.telegram.bot.handleUpdate>[0]);
    } catch (error) {
      this.logFailure('Telegram update handling failed', error);
    }
  }

  private registerHandlers(): void {
    const { bot } = this.telegram;

    bot.catch((error) => this.logFailure('Telegram handler error', error.error));

    // Private chats only; AC-20 dedupe by update id.
    bot.use(async (ctx, next) => {
      if (ctx.chat && ctx.chat.type !== 'private') {
        return;
      }
      if (!(await this.telegram.claimUpdate(ctx.update.update_id))) {
        return;
      }
      await next();
    });

    // AC-31
    bot.on('my_chat_member', async (ctx) => {
      const status = ctx.myChatMember.new_chat_member.status;
      const chatId = String(ctx.chat.id);

      if (status === 'kicked') {
        const link = await this.links.findByChatId(chatId);
        if (link) {
          await this.links.markUnreachable(link.userId);
        }
      } else if (status === 'member') {
        await this.links.clearUnreachable(chatId);
      }
    });

    bot.command('start', (ctx) => this.handleStart(ctx));
    bot.command('stop', (ctx) => this.handleStop(ctx));
    bot.on('message', (ctx) => this.handleMessage(ctx));
  }

  private async handleStart(ctx: Context): Promise<void> {
    const chatId = String(ctx.chat?.id);
    const token = typeof ctx.match === 'string' ? ctx.match.trim() : '';

    if (token) {
      const result = await this.links.consumeToken(token, chatId);

      if (result.outcome === 'invalid') {
        await this.replyUnlogged(ctx, NOT_LINKED_REPLY);
      } else if (result.outcome === 'chat_linked_to_other_user') {
        await this.replyUnlogged(ctx, CHAT_CONFLICT_REPLY);
      } else {
        // The raw token is never stored: only the bare command is logged.
        await this.logInbound(ctx, result.link.userId, '/start');
        await this.replyLogged(result.link.userId, chatId, this.greeting());
      }
      return;
    }

    const result = await this.links.startWithoutToken(chatId);
    if (result.outcome === 'not_linked') {
      await this.replyUnlogged(ctx, NOT_LINKED_REPLY); // AC-9
      return;
    }

    await this.logInbound(ctx, result.link.userId, '/start');
    await this.replyLogged(
      result.link.userId,
      chatId,
      result.outcome === 'reenabled' ? this.greeting('Messages are enabled again.') : ALREADY_LINKED_REPLY,
    );
  }

  private async handleStop(ctx: Context): Promise<void> {
    const link = await this.links.optOut(String(ctx.chat?.id));
    if (!link) {
      await this.replyUnlogged(ctx, STOP_NOT_LINKED_REPLY); // AC-15
      return;
    }

    await this.logInbound(ctx, link.userId, '/stop');
    await this.replyLogged(link.userId, link.chatId, STOPPED_REPLY);
  }

  private async handleMessage(ctx: Context): Promise<void> {
    const message = ctx.message;
    if (!message) {
      return;
    }

    const link = await this.links.findByChatId(String(ctx.chat?.id));
    if (!link) {
      await this.replyUnlogged(ctx, NOT_LINKED_REPLY); // AC-18
      return;
    }

    const kind = CONTENT_KINDS.find((key) => key in message);
    if (message.text !== undefined) {
      await this.logInbound(ctx, link.userId, message.text);
    } else {
      // AC-17: placeholder only; media is never downloaded or stored.
      await this.telegram.logInbound(
        link.userId,
        kind ?? 'other',
        null,
        message.message_id,
        fromUnixTime(message.date),
      );
    }
  }

  private greeting(prefix?: string): string {
    return [
      prefix,
      'Hi! This bot is operated by the business that sent you the link. ' +
        'It will be used to exchange messages with you in this chat. ' +
        'Send /stop at any time to stop receiving messages.',
      this.privacyPolicyUrl ? `Privacy policy: ${this.privacyPolicyUrl}` : undefined,
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  private logInbound(ctx: Context, userId: string, text: string): Promise<unknown> {
    const message = ctx.message;
    if (!message) {
      return Promise.resolve();
    }

    return this.telegram.logInbound(
      userId,
      'text',
      text,
      message.message_id,
      fromUnixTime(message.date),
    );
  }

  /** Reply to a linked client: logged as an outbound entry (AC-19). */
  private async replyLogged(userId: string, chatId: string, text: string): Promise<void> {
    try {
      await this.telegram.deliver(userId, chatId, text);
    } catch {
      // `deliver` already logged the failure; nothing more to do for an automatic reply.
    }
  }

  /** Reply to an unlinked chat: no User exists, so nothing is logged. */
  private async replyUnlogged(ctx: Context, text: string): Promise<void> {
    try {
      await ctx.reply(text);
    } catch (error) {
      this.logFailure('Telegram reply failed', error);
    }
  }

  private logFailure(message: string, error: unknown): void {
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    this.logger.error(`${message}: ${this.telegram.redact(detail)}`);
  }
}
