import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Logger,
  Post,
  Query,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import { timingSafeEqual } from 'node:crypto';
import { UsersService } from '../../users/users.service.js';

/**
 * Meta's webhook endpoint (`/api/whatsapp/webhook`).
 *
 * Everything in a POST body here is third-party input: it is only ever read for a phone
 * number, a timestamp and a status string, and is sanitised before it reaches the log.
 * It is never interpreted as instructions or forwarded verbatim downstream.
 */
@ApiExcludeController()
@Controller('whatsapp/webhook')
export class WhatsAppWebhookController {
  private readonly logger = new Logger(WhatsAppWebhookController.name);
  private readonly verifyToken: string;

  // Explicit @Inject: see AppController's constructor comment — this whole module tree
  // also runs under `tsx` (agent-worker), which doesn't emit DI-reflection metadata.
  constructor(
    @Inject(UsersService) private readonly usersService: UsersService,
    @Inject(ConfigService) configService: ConfigService,
  ) {
    this.verifyToken = configService.getOrThrow<string>('WHATSAPP_WEBHOOK_VERIFY_TOKEN');
  }

  /** AC-15 / AC-16: Meta's subscription handshake. */
  @Get()
  verify(
    @Query('hub.mode') mode?: string,
    @Query('hub.verify_token') token?: string,
    @Query('hub.challenge') challenge?: string,
  ): string {
    if (typeof token !== 'string' || !constantTimeEquals(token, this.verifyToken)) {
      this.logger.warn(`Rejected webhook verification (mode=${sanitizeForLog(mode ?? '')})`);
      throw new ForbiddenException('Invalid verify token');
    }

    return challenge ?? '';
  }

  /**
   * AC-21: always answers 200, whatever the body contains — a non-2xx just makes Meta
   * retry, and nothing here is worth a retry storm.
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  async receive(@Body() payload: unknown): Promise<string> {
    try {
      await this.ingest(payload);
    } catch (error) {
      // AC-20: malformed or unexpected payloads are logged, never thrown.
      this.logger.error(
        `Failed to process WhatsApp webhook payload: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    return 'EVENT_RECEIVED';
  }

  private async ingest(payload: unknown): Promise<void> {
    const entries = readArray(readProperty(payload, 'entry'));

    for (const entry of entries) {
      for (const change of readArray(readProperty(entry, 'changes'))) {
        const value = readProperty(change, 'value');

        for (const message of readArray(readProperty(value, 'messages'))) {
          await this.handleInboundMessage(message);
        }

        for (const status of readArray(readProperty(value, 'statuses'))) {
          await this.handleStatus(status);
        }
      }
    }
  }

  /** AC-17: reopen the contact's 24h free-form window. */
  private async handleInboundMessage(message: unknown): Promise<void> {
    const phoneNumber = toE164(readString(readProperty(message, 'from')));
    if (!phoneNumber) {
      this.logger.warn('Inbound WhatsApp message without a usable sender number — ignored');
      return;
    }

    const receivedAt = parseUnixSeconds(readProperty(message, 'timestamp'));
    if (!receivedAt) {
      this.logger.warn(
        `Inbound WhatsApp message with an unreadable timestamp — falling back to now`,
      );
    }

    const updated = await this.usersService.markInboundMessage(phoneNumber, receivedAt ?? new Date());
    if (!updated) {
      // AC-19: unknown numbers are dropped, not auto-registered.
      this.logger.log(
        `Inbound WhatsApp message from unknown number ${sanitizeForLog(phoneNumber)} — ignored`,
      );
    }
  }

  /** AC-18: record the latest delivery status Meta reported for this contact. */
  private async handleStatus(status: unknown): Promise<void> {
    const phoneNumber = toE164(readString(readProperty(status, 'recipient_id')));
    const statusValue = readString(readProperty(status, 'status'));

    if (!phoneNumber || !statusValue) {
      this.logger.warn('WhatsApp status event missing recipient or status — ignored');
      return;
    }

    const updated = await this.usersService.markMessageStatus(
      phoneNumber,
      sanitizeForLog(statusValue).slice(0, 64),
    );
    if (!updated) {
      this.logger.log(
        `WhatsApp status for unknown number ${sanitizeForLog(phoneNumber)} — ignored`,
      );
    }
  }
}

function readProperty(source: unknown, key: string): unknown {
  if (typeof source !== 'object' || source === null) {
    return undefined;
  }

  return (source as Record<string, unknown>)[key];
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** Meta reports numbers as bare digits; the `User` table stores them with a leading `+`. */
function toE164(raw: string | undefined): string | undefined {
  if (!raw) {
    return undefined;
  }

  const digits = raw.replace(/\D/g, '');

  return digits.length > 0 ? `+${digits}` : undefined;
}

function parseUnixSeconds(value: unknown): Date | undefined {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return undefined;
  }

  return new Date(seconds * 1000);
}

/** Keeps third-party text from injecting newlines or control characters into the log. */
function sanitizeForLog(value: string): string {
  return value.replace(/[\p{C}]/gu, ' ').slice(0, 200);
}

function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');

  return left.length === right.length && timingSafeEqual(left, right);
}
