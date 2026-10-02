import { BadGatewayException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WhatsAppMessage } from './entities/whatsapp-message.entity.js';
import { WhatsAppService, type WhatsAppRecipient } from './whatsapp.service.js';

const CONFIG: Record<string, string> = {
  WHATSAPP_PHONE_NUMBER_ID: '100000000000001',
  WHATSAPP_ACCESS_TOKEN: 'test-access-token',
  WHATSAPP_API_VERSION: 'v21.0',
  WHATSAPP_FALLBACK_TEMPLATE_NAME: 'hello_world',
  WHATSAPP_FALLBACK_TEMPLATE_LANGUAGE: 'en_US',
};

const HOUR = 60 * 60 * 1000;

function recipient(lastInboundMessageAt: Date | null): WhatsAppRecipient {
  return { id: 'a0a0a0a0-0000-4000-8000-000000000001', phoneNumber: '+380501234567', lastInboundMessageAt };
}

function lastRequest(fetchMock: ReturnType<typeof vi.fn>) {
  const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];

  return { url, init, payload: JSON.parse(init.body as string) };
}

describe('WhatsAppService', () => {
  let service: WhatsAppService;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    fetchMock = vi.fn().mockResolvedValue(new Response('{"messages":[{"id":"wamid.1"}]}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const moduleRef = await Test.createTestingModule({
      providers: [
        WhatsAppService,
        { provide: ConfigService, useValue: { getOrThrow: (key: string) => CONFIG[key] } },
        {
          provide: getRepositoryToken(WhatsAppMessage),
          useValue: { create: (entry: unknown) => entry, save: vi.fn() },
        },
      ],
    }).compile();

    service = moduleRef.get(WhatsAppService);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('isWithinSessionWindow', () => {
    it('is closed when the contact has never written', () => {
      expect(service.isWithinSessionWindow(null)).toBe(false);
    });

    it('is open just inside 24 hours and closed just outside', () => {
      const now = new Date('2026-10-02T12:00:00Z');

      expect(service.isWithinSessionWindow(new Date(now.getTime() - 23 * HOUR), now)).toBe(true);
      expect(service.isWithinSessionWindow(new Date(now.getTime() - 25 * HOUR), now)).toBe(false);
    });
  });

  // AC-9
  it('sends free-form text inside the session window', async () => {
    const result = await service.sendTextMessage(recipient(new Date(Date.now() - HOUR)), 'Hello!');

    expect(result).toEqual({ deliveryMode: 'freeform' });

    const { url, init, payload } = lastRequest(fetchMock);
    expect(url).toBe('https://graph.facebook.com/v21.0/100000000000001/messages');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-access-token');
    expect(payload).toMatchObject({
      messaging_product: 'whatsapp',
      // Graph expects the E.164 number without the leading `+`.
      to: '380501234567',
      type: 'text',
      text: { body: 'Hello!' },
    });
  });

  // AC-10
  it('falls back to the configured template outside the session window', async () => {
    const result = await service.sendTextMessage(
      recipient(new Date(Date.now() - 25 * HOUR)),
      'Hello!',
    );

    expect(result).toEqual({ deliveryMode: 'template' });

    const { payload } = lastRequest(fetchMock);
    expect(payload).toMatchObject({
      type: 'template',
      template: { name: 'hello_world', language: { code: 'en_US' } },
    });
    // The typed text must not ride along — only the approved template may be sent.
    expect(JSON.stringify(payload)).not.toContain('Hello!');
  });

  // AC-10
  it('falls back to the template for a contact who never wrote', async () => {
    await expect(service.sendTextMessage(recipient(null), 'Hello!')).resolves.toEqual({
      deliveryMode: 'template',
    });
  });

  // AC-13
  it('reports a gateway error without leaking Meta error detail', async () => {
    fetchMock.mockResolvedValue(
      new Response('{"error":{"message":"Template not approved","code":132001}}', { status: 400 }),
    );

    const error = await service
      .sendTextMessage(recipient(new Date()), 'Hello!')
      .then(() => undefined)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(BadGatewayException);
    expect(JSON.stringify((error as BadGatewayException).getResponse())).not.toContain(
      'Template not approved',
    );
  });

  // AC-14
  it('treats a request timeout like a failed response', async () => {
    fetchMock.mockRejectedValue(new DOMException('The operation was aborted.', 'TimeoutError'));

    await expect(service.sendTextMessage(recipient(new Date()), 'Hello!')).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });

  it('bounds every outbound request with an abort signal', async () => {
    await service.sendTextMessage(recipient(new Date()), 'Hello!');

    expect(lastRequest(fetchMock).init.signal).toBeInstanceOf(AbortSignal);
  });
});
