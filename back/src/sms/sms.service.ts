import { BadGatewayException, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SmsMessage } from './entities/sms-message.entity.js';

const TWILIO_BASE_URL = 'https://api.twilio.com/2010-04-01';
const REQUEST_TIMEOUT_MS = 10_000;

/** The only thing this module needs to know about a recipient — not the `User` entity. */
export interface SmsRecipient {
  id: string;
  phoneNumber: string;
}

/**
 * Owns every Twilio SMS API detail — account sid, auth token, sender number. Independent
 * of WhatsApp's session-window/template logic (SPEC-03 non-goals): every SMS is free text.
 */
@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  private readonly accountSid: string;
  private readonly authToken: string;
  private readonly fromNumber: string;

  // Explicit @Inject: see AppController's constructor comment — this whole module tree
  // also runs under `tsx` (agent-worker), which doesn't emit DI-reflection metadata.
  constructor(
    @Inject(ConfigService) configService: ConfigService,
    @InjectRepository(SmsMessage)
    private readonly messagesRepository: Repository<SmsMessage>,
  ) {
    this.accountSid = configService.getOrThrow<string>('TWILIO_ACCOUNT_SID');
    this.authToken = configService.getOrThrow<string>('TWILIO_AUTH_TOKEN');
    this.fromNumber = configService.getOrThrow<string>('TWILIO_SMS_FROM_NUMBER');
  }

  /** AC-6: that User's logged SMS sends, most-recent-first. */
  listMessages(userId: string): Promise<SmsMessage[]> {
    return this.messagesRepository.find({ where: { userId }, order: { createdAt: 'DESC' } });
  }

  /** AC-1: sends, logs the attempt either way, and returns the log entry on success. */
  async sendSms(recipient: SmsRecipient, body: string): Promise<SmsMessage> {
    try {
      await this.postMessage(recipient.phoneNumber, body);
    } catch (error) {
      // AC-4 / AC-5: timeout and non-2xx are both handled the same way; full detail
      // stays server-side, the caller only learns the send failed.
      const detail = describeError(error);
      this.logger.error(`Twilio SMS send failed: ${detail}`);
      await this.logMessage(recipient, body, 'failed', detail);
      throw new BadGatewayException('Failed to send the SMS message');
    }

    return this.logMessage(recipient, body, 'sent', null);
  }

  private async postMessage(to: string, body: string): Promise<void> {
    const url = `${TWILIO_BASE_URL}/Accounts/${this.accountSid}/Messages.json`;
    const credentials = Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64');
    const params = new URLSearchParams({ To: to, From: this.fromNumber, Body: body });

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      throw new Error(`Twilio request failed: ${describeError(error)}`);
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => '<unreadable response body>');
      throw new Error(`Twilio responded ${response.status}: ${detail}`);
    }
  }

  private async logMessage(
    recipient: SmsRecipient,
    body: string,
    status: 'sent' | 'failed',
    failureReason: string | null,
  ): Promise<SmsMessage> {
    const entry = this.messagesRepository.create({
      userId: recipient.id,
      phoneNumber: recipient.phoneNumber,
      body,
      status,
      failureReason,
    });

    return this.messagesRepository.save(entry);
  }
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }

  return String(error);
}
