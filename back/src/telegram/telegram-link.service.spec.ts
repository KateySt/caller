import { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import type { TelegramLink } from './entities/telegram-link.entity.js';
import { TelegramLinkService, deriveStatus, hashToken } from './telegram-link.service.js';

const USER_ID = 'a0a0a0a0-0000-4000-8000-000000000001';

function link(overrides: Partial<TelegramLink>): TelegramLink {
  return {
    userId: USER_ID,
    chatId: '42',
    linkedAt: new Date(),
    optedOutAt: null,
    unreachableAt: null,
    ...overrides,
  } as TelegramLink;
}

describe('deriveStatus', () => {
  it('maps link state to a status, unreachable taking precedence', () => {
    expect(deriveStatus(null)).toBe('not_linked');
    expect(deriveStatus(link({}))).toBe('linked');
    expect(deriveStatus(link({ optedOutAt: new Date() }))).toBe('opted_out');
    expect(deriveStatus(link({ optedOutAt: new Date(), unreachableAt: new Date() }))).toBe(
      'unreachable',
    );
  });
});

describe('TelegramLinkService.createInvite', () => {
  it('stores only a hash and returns a deep link with a valid token (AC-1..AC-3)', async () => {
    const inserted: Record<string, unknown>[] = [];
    const manager = {
      update: vi.fn().mockResolvedValue(undefined),
      insert: vi.fn((_entity: unknown, row: Record<string, unknown>) => {
        inserted.push(row);
        return Promise.resolve();
      }),
    };
    const dataSource = { transaction: (work: (m: typeof manager) => Promise<void>) => work(manager) };
    const links = { findOne: vi.fn().mockResolvedValue(null) };
    const tokens = { exists: vi.fn().mockResolvedValue(true) };
    const config = { getOrThrow: () => 'test_bot' } as unknown as ConfigService;

    const service = new TelegramLinkService(config, dataSource as never, links as never, tokens as never);
    const invite = await service.createInvite(USER_ID);

    const token = new URL(invite.link).searchParams.get('start') as string;
    expect(invite.link.startsWith('https://t.me/test_bot?start=')).toBe(true);
    expect(token).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
    expect(token).not.toContain(USER_ID);
    expect(inserted[0]?.tokenHash).toBe(hashToken(token));
    expect(JSON.stringify(inserted)).not.toContain(token);
    // AC-4: earlier unused invitations are invalidated first.
    expect(manager.update).toHaveBeenCalledOnce();
    expect(invite.expiresAt.getTime()).toBeGreaterThan(Date.now() + 6 * 24 * 3600 * 1000);
    expect(invite.status.hasPendingInvite).toBe(true);
  });
});
