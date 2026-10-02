import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter.js';

/**
 * Covers the HTTP contract of SPEC-01 end to end: routing, the global validation pipe,
 * the exception filter and the real `user` table. Needs the local Postgres from the root
 * `docker compose up -d`. Only the Meta Cloud API itself is faked, via `fetch`.
 */
describe('Users & WhatsApp messaging (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let fetchMock: ReturnType<typeof vi.fn>;

  const VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleFixture.createNestApplication({ rawBody: true });
    // Mirrors main.ts so the pipe and filter under test are the real ones.
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    app.setGlobalPrefix('api');
    await app.init();

    dataSource = moduleFixture.get(DataSource);
  });

  beforeEach(async () => {
    await dataSource.query('DELETE FROM "user"');
    fetchMock = vi.fn().mockResolvedValue(new Response('{"messages":[{"id":"wamid.1"}]}'));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await app.close();
  });

  const createUser = (name = 'Ada Lovelace', phoneNumber = '+380501234567') =>
    request(app.getHttpServer()).post('/api/users').send({ name, phoneNumber });

  describe('GET /api/users', () => {
    // AC-7
    it('returns an empty list rather than an error when nobody is registered', async () => {
      const response = await request(app.getHttpServer()).get('/api/users').expect(200);

      expect(response.body).toEqual([]);
    });

    // AC-6
    it('returns only the public fields', async () => {
      await createUser().expect(201);

      const response = await request(app.getHttpServer()).get('/api/users').expect(200);

      expect(response.body).toHaveLength(1);
      expect(Object.keys(response.body[0]).sort()).toEqual([
        'createdAt',
        'id',
        'name',
        'phoneNumber',
      ]);
    });
  });

  describe('POST /api/users', () => {
    // AC-2
    it('creates a user and echoes its public fields', async () => {
      const response = await createUser('  Ada Lovelace  ').expect(201);

      expect(response.body).toMatchObject({ name: 'Ada Lovelace', phoneNumber: '+380501234567' });
      expect(response.body.id).toMatch(/^[0-9a-f-]{36}$/);
    });

    // AC-3
    it.each(['0501234567', '+0501234567', '+38 050 123 45 67', 'not-a-number'])(
      'rejects %s as a phone number',
      async (phoneNumber) => {
        await createUser('Ada', phoneNumber).expect(400);

        expect(await dataSource.query('SELECT 1 FROM "user"')).toHaveLength(0);
      },
    );

    // AC-4
    it('rejects a duplicate phone number with a conflict', async () => {
      await createUser().expect(201);
      await createUser('Someone else').expect(409);

      expect(await dataSource.query('SELECT 1 FROM "user"')).toHaveLength(1);
    });

    // AC-5
    it.each([{ name: '' }, { name: '   ' }, {}])(
      'rejects a missing or blank name (%j)',
      async (body) => {
        await request(app.getHttpServer())
          .post('/api/users')
          .send({ phoneNumber: '+380501234567', ...body })
          .expect(400);
      },
    );

    it('rejects unknown fields instead of silently dropping them', async () => {
      await request(app.getHttpServer())
        .post('/api/users')
        .send({ name: 'Ada', phoneNumber: '+380501234567', lastInboundMessageAt: new Date() })
        .expect(400);
    });
  });

  describe('POST /api/users/:id/messages', () => {
    // AC-10
    it('falls back to a template for a contact who never wrote', async () => {
      const { body: user } = await createUser().expect(201);

      const response = await request(app.getHttpServer())
        .post(`/api/users/${user.id}/messages`)
        .send({ body: 'Hello!' })
        .expect(200);

      expect(response.body).toEqual({ deliveryMode: 'template' });
    });

    // AC-9, AC-17: the webhook opens the window, so the next send goes out free-form.
    it('sends free-form text after an inbound message reopens the window', async () => {
      const { body: user } = await createUser().expect(201);

      await request(app.getHttpServer())
        .post('/api/whatsapp/webhook')
        .send(inboundMessageEvent('380501234567', Math.floor(Date.now() / 1000)))
        .expect(200);

      const response = await request(app.getHttpServer())
        .post(`/api/users/${user.id}/messages`)
        .send({ body: 'Hello!' })
        .expect(200);

      expect(response.body).toEqual({ deliveryMode: 'freeform' });
    });

    // AC-11
    it.each([
      ['an unknown id', '3f1b2c4d-5e6f-4a8b-9c0d-1e2f3a4b5c6d'],
      ['a malformed id', 'not-a-uuid'],
    ])('returns 404 for %s without calling WhatsApp', async (_label, id) => {
      await request(app.getHttpServer())
        .post(`/api/users/${id}/messages`)
        .send({ body: 'Hello!' })
        .expect(404);

      expect(fetchMock).not.toHaveBeenCalled();
    });

    // AC-12
    it.each([
      ['an empty body', ''],
      ['a whitespace-only body', '   \n\t  '],
      ['an over-long body', 'x'.repeat(4097)],
    ])('rejects %s without calling WhatsApp', async (_label, body) => {
      const { body: user } = await createUser().expect(201);

      await request(app.getHttpServer())
        .post(`/api/users/${user.id}/messages`)
        .send({ body })
        .expect(400);

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('accepts a body of exactly the maximum length', async () => {
      const { body: user } = await createUser().expect(201);

      await request(app.getHttpServer())
        .post(`/api/users/${user.id}/messages`)
        .send({ body: 'x'.repeat(4096) })
        .expect(200);
    });

    // AC-13
    it('returns a sanitized 502 when Meta rejects the send', async () => {
      fetchMock.mockResolvedValue(
        new Response('{"error":{"message":"Template not approved"}}', { status: 400 }),
      );
      const { body: user } = await createUser().expect(201);

      const response = await request(app.getHttpServer())
        .post(`/api/users/${user.id}/messages`)
        .send({ body: 'Hello!' })
        .expect(502);

      expect(JSON.stringify(response.body)).not.toContain('Template not approved');
    });
  });

  describe('GET /api/whatsapp/webhook', () => {
    // AC-15
    it('echoes the challenge when the verify token matches', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/whatsapp/webhook')
        .query({
          'hub.mode': 'subscribe',
          'hub.verify_token': VERIFY_TOKEN,
          'hub.challenge': '98765',
        })
        .expect(200);

      expect(response.text).toBe('98765');
    });

    // AC-16
    it('rejects a wrong verify token without echoing the challenge', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/whatsapp/webhook')
        .query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'wrong', 'hub.challenge': '98765' })
        .expect(403);

      expect(response.text).not.toContain('98765');
    });
  });

  describe('POST /api/whatsapp/webhook', () => {
    // AC-18
    it('records the latest delivery status for a known contact', async () => {
      await createUser().expect(201);

      await request(app.getHttpServer())
        .post('/api/whatsapp/webhook')
        .send(statusEvent('380501234567', 'delivered'))
        .expect(200);

      const [row] = await dataSource.query('SELECT "lastWhatsAppMessageStatus" FROM "user"');
      expect(row.lastWhatsAppMessageStatus).toBe('delivered');
    });

    // AC-22
    it('applies a replayed event again, last write wins', async () => {
      await createUser().expect(201);
      const event = statusEvent('380501234567', 'read');

      await request(app.getHttpServer()).post('/api/whatsapp/webhook').send(event).expect(200);
      await request(app.getHttpServer()).post('/api/whatsapp/webhook').send(event).expect(200);

      const rows = await dataSource.query('SELECT "lastWhatsAppMessageStatus" FROM "user"');
      expect(rows).toHaveLength(1);
      expect(rows[0].lastWhatsAppMessageStatus).toBe('read');
    });

    // AC-19
    it('ignores an event for an unknown number without creating a user', async () => {
      await request(app.getHttpServer())
        .post('/api/whatsapp/webhook')
        .send(inboundMessageEvent('380509999999', Math.floor(Date.now() / 1000)))
        .expect(200);

      expect(await dataSource.query('SELECT 1 FROM "user"')).toHaveLength(0);
    });

    // AC-20, AC-21
    it.each([
      ['an empty object', {}],
      ['a wrong shape', { entry: 'not-an-array' }],
      ['nested nulls', { entry: [{ changes: [{ value: { messages: [null] } }] }] }],
      ['an unexpected top level', { hello: 'world' }],
    ])('still answers 200 for %s', async (_label, payload) => {
      await request(app.getHttpServer()).post('/api/whatsapp/webhook').send(payload).expect(200);
    });
  });

  describe('POST /api/livekit/call-tokens', () => {
    it('rejects an unknown contact before touching LiveKit', async () => {
      await request(app.getHttpServer())
        .post('/api/livekit/call-tokens')
        .send({ userId: '3f1b2c4d-5e6f-4a8b-9c0d-1e2f3a4b5c6d' })
        .expect(404);
    });

    it('rejects a malformed contact id', async () => {
      await request(app.getHttpServer())
        .post('/api/livekit/call-tokens')
        .send({ userId: 'not-a-uuid' })
        .expect(400);
    });
  });
});

function inboundMessageEvent(from: string, timestamp: number) {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: '0',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              messages: [
                {
                  from,
                  id: 'wamid.in',
                  timestamp: String(timestamp),
                  type: 'text',
                  text: { body: 'hi' },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

function statusEvent(recipientId: string, status: string) {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: '0',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              statuses: [
                { id: 'wamid.out', status, timestamp: '1790923000', recipient_id: recipientId },
              ],
            },
          },
        ],
      },
    ],
  };
}
