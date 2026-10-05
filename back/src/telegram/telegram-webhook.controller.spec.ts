import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { TelegramWebhookController } from './telegram-webhook.controller.js';
import type { TelegramUpdatesService } from './telegram-updates.service.js';

function controllerWith(secret: string | undefined) {
  const handleWebhookUpdate = vi.fn().mockResolvedValue(undefined);
  const updates = { expectedWebhookSecret: secret, handleWebhookUpdate };

  return {
    handleWebhookUpdate,
    controller: new TelegramWebhookController(updates as unknown as TelegramUpdatesService),
  };
}

describe('TelegramWebhookController', () => {
  it('processes nothing when the secret header is missing or wrong (AC-33)', () => {
    const { controller, handleWebhookUpdate } = controllerWith('right-secret');

    expect(() => controller.receive(undefined, {})).toThrow(ForbiddenException);
    expect(() => controller.receive('wrong-secret', {})).toThrow(ForbiddenException);
    expect(handleWebhookUpdate).not.toHaveBeenCalled();
  });

  it('acknowledges and hands off a correctly signed update (AC-34)', () => {
    const { controller, handleWebhookUpdate } = controllerWith('right-secret');
    const update = { update_id: 1 };

    controller.receive('right-secret', update);

    expect(handleWebhookUpdate).toHaveBeenCalledWith(update);
  });

  it('serves no webhook in polling mode', () => {
    const { controller } = controllerWith(undefined);

    expect(() => controller.receive('anything', {})).toThrow(NotFoundException);
  });
});
