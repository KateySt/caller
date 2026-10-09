import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { validate } from './env.validation.js';

const BASE = {
  WHATSAPP_PHONE_NUMBER_ID: 'x',
  WHATSAPP_ACCESS_TOKEN: 'x',
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: 'x',
  WHATSAPP_FALLBACK_TEMPLATE_NAME: 'x',
  LIVEKIT_URL: 'ws://localhost:7880',
  LIVEKIT_API_KEY: 'x',
  LIVEKIT_API_SECRET: 'x',
  LIVEKIT_SIP_TRUNK_ID: 'x',
  AGENT_INTERNAL_TOKEN: 'x'.repeat(32),
  TWILIO_ACCOUNT_SID: 'x',
  TWILIO_AUTH_TOKEN: 'x',
  TWILIO_SMS_FROM_NUMBER: 'x',
  TELEGRAM_BOT_TOKEN: '123:abc',
  TELEGRAM_BOT_USERNAME: 'my_bot',
};

describe('Telegram env validation (AC-36)', () => {
  it('fails to start without a bot token', () => {
    const { TELEGRAM_BOT_TOKEN: _omitted, ...rest } = BASE;

    expect(() => validate(rest)).toThrow();
  });

  it('treats empty optional values as unset and needs no webhook secret in polling mode', () => {
    expect(() =>
      validate({ ...BASE, TELEGRAM_WEBHOOK_URL: '', TELEGRAM_WEBHOOK_SECRET: '', TELEGRAM_PRIVACY_POLICY_URL: '' }),
    ).not.toThrow();
  });

  it('requires a valid webhook secret once a webhook URL is set', () => {
    const webhook = { ...BASE, TELEGRAM_WEBHOOK_URL: 'https://example.com/api/telegram/webhook' };

    expect(() => validate(webhook)).toThrow();
    expect(() => validate({ ...webhook, TELEGRAM_WEBHOOK_SECRET: 'bad secret!' })).toThrow();
    expect(() => validate({ ...webhook, TELEGRAM_WEBHOOK_SECRET: 'good_secret-1' })).not.toThrow();
  });

  it('rejects a non-https privacy policy URL', () => {
    expect(() => validate({ ...BASE, TELEGRAM_PRIVACY_POLICY_URL: 'http://example.com/p' })).toThrow();
  });
});
