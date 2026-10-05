import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { addDays } from 'date-fns';
import { createHash, randomBytes } from 'node:crypto';
import { DataSource, IsNull, MoreThan, Repository } from 'typeorm';
import { isUniqueViolation } from '../common/postgres.util.js';
import { TelegramLinkToken } from './entities/telegram-link-token.entity.js';
import { TelegramLink } from './entities/telegram-link.entity.js';

export const INVITE_TTL_DAYS = 7;

export type TelegramStatus = 'not_linked' | 'linked' | 'opted_out' | 'unreachable';

export interface TelegramStatusInfo {
  status: TelegramStatus;
  linkedAt: Date | null;
  optedOutAt: Date | null;
  unreachableAt: Date | null;
  /** An unused, unexpired, not-replaced invitation exists (lets the UI warn before regenerating). */
  hasPendingInvite: boolean;
}

export interface TelegramInvite {
  link: string;
  expiresAt: Date;
  status: TelegramStatusInfo;
}

export type ConsumeResult =
  | { outcome: 'linked'; link: TelegramLink }
  | { outcome: 'invalid' }
  | { outcome: 'chat_linked_to_other_user' };

export type StartWithoutTokenResult =
  | { outcome: 'not_linked' }
  | { outcome: 'already_linked'; link: TelegramLink }
  | { outcome: 'reenabled'; link: TelegramLink };

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function deriveStatus(link: TelegramLink | null): TelegramStatus {
  if (!link) return 'not_linked';
  if (link.unreachableAt) return 'unreachable';
  if (link.optedOutAt) return 'opted_out';
  return 'linked';
}

/** Owns invitation tokens and the User ↔ Telegram chat link state (SPEC-04 AC-1..15, AC-31). */
@Injectable()
export class TelegramLinkService {
  private readonly botUsername: string;

  // Explicit @Inject: this module tree also runs under `tsx`, which emits no DI metadata.
  constructor(
    @Inject(ConfigService) configService: ConfigService,
    @Inject(DataSource) private readonly dataSource: DataSource,
    @InjectRepository(TelegramLink) private readonly links: Repository<TelegramLink>,
    @InjectRepository(TelegramLinkToken) private readonly tokens: Repository<TelegramLinkToken>,
  ) {
    this.botUsername = configService.getOrThrow<string>('TELEGRAM_BOT_USERNAME');
  }

  /** AC-1..AC-4: new single-use token; any earlier unused one for the User stops working. */
  async createInvite(userId: string): Promise<TelegramInvite> {
    // 32 random bytes → 43 chars of base64url (`A-Za-z0-9_-`), no personal data (AC-2).
    const token = randomBytes(32).toString('base64url');
    const expiresAt = addDays(new Date(), INVITE_TTL_DAYS);

    await this.dataSource.transaction(async (manager) => {
      await manager.update(
        TelegramLinkToken,
        { userId, usedAt: IsNull(), invalidatedAt: IsNull() },
        { invalidatedAt: new Date() },
      );
      await manager.insert(TelegramLinkToken, { userId, tokenHash: hashToken(token), expiresAt });
    });

    return {
      link: `https://t.me/${this.botUsername}?start=${token}`,
      expiresAt,
      status: await this.getStatus(userId),
    };
  }

  /** AC-7 */
  async getStatus(userId: string): Promise<TelegramStatusInfo> {
    const [link, pending] = await Promise.all([
      this.links.findOne({ where: { userId } }),
      this.tokens.exists({
        where: {
          userId,
          usedAt: IsNull(),
          invalidatedAt: IsNull(),
          expiresAt: MoreThan(new Date()),
        },
      }),
    ]);

    return {
      status: deriveStatus(link),
      linkedAt: link?.linkedAt ?? null,
      optedOutAt: link?.optedOutAt ?? null,
      unreachableAt: link?.unreachableAt ?? null,
      hasPendingInvite: pending,
    };
  }

  findByUserId(userId: string): Promise<TelegramLink | null> {
    return this.links.findOne({ where: { userId } });
  }

  findByChatId(chatId: string): Promise<TelegramLink | null> {
    return this.links.findOne({ where: { chatId } });
  }

  /** AC-8..AC-12: validates the token and links the chat in one transaction. */
  async consumeToken(token: string, chatId: string): Promise<ConsumeResult> {
    try {
      return await this.dataSource.transaction(async (manager) => {
        const record = await manager.findOne(TelegramLinkToken, {
          where: {
            tokenHash: hashToken(token),
            usedAt: IsNull(),
            invalidatedAt: IsNull(),
            expiresAt: MoreThan(new Date()),
          },
          lock: { mode: 'pessimistic_write' },
        });
        if (!record) {
          return { outcome: 'invalid' as const };
        }

        // AC-11: this chat already belongs to another User — reject, change nothing.
        const chatOwner = await manager.findOne(TelegramLink, { where: { chatId } });
        if (chatOwner && chatOwner.userId !== record.userId) {
          return { outcome: 'chat_linked_to_other_user' as const };
        }

        const now = new Date();
        // AC-10: overwriting the row detaches any previous chat; AC-12: state is cleared.
        const link = manager.create(TelegramLink, {
          userId: record.userId,
          chatId,
          linkedAt: now,
          optedOutAt: null,
          unreachableAt: null,
        });
        await manager.save(link);
        record.usedAt = now;
        await manager.save(record);

        return { outcome: 'linked' as const, link };
      });
    } catch (error) {
      // Lost a race to link the same chat to a different User.
      if (isUniqueViolation(error)) {
        return { outcome: 'chat_linked_to_other_user' };
      }
      throw error;
    }
  }

  /** AC-13 / AC-13a: bare `/start`. The linked chat is the consent evidence for re-enabling. */
  async startWithoutToken(chatId: string): Promise<StartWithoutTokenResult> {
    const link = await this.findByChatId(chatId);
    if (!link) {
      return { outcome: 'not_linked' };
    }
    if (!link.optedOutAt && !link.unreachableAt) {
      return { outcome: 'already_linked', link };
    }

    link.optedOutAt = null;
    link.unreachableAt = null;
    await this.links.save(link);

    return { outcome: 'reenabled', link };
  }

  /** AC-14 / AC-15: null when the chat isn't linked. */
  async optOut(chatId: string): Promise<TelegramLink | null> {
    const link = await this.findByChatId(chatId);
    if (!link) {
      return null;
    }

    link.optedOutAt = new Date();
    return this.links.save(link);
  }

  /** AC-28 / AC-31 */
  async markUnreachable(userId: string): Promise<void> {
    await this.links.update({ userId }, { unreachableAt: new Date() });
  }

  /** AC-31: an opted-out User stays opted out. */
  async clearUnreachable(chatId: string): Promise<TelegramLink | null> {
    const link = await this.findByChatId(chatId);
    if (link?.unreachableAt) {
      link.unreachableAt = null;
      return this.links.save(link);
    }
    return link;
  }
}
