import { BadGatewayException, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { addHours, isBefore } from 'date-fns';
import { Repository } from 'typeorm';
import { WhatsAppMessage } from './entities/whatsapp-message.entity.js';

/** How the message actually left the system — reported back to the caller (SPEC-01 AC-8). */
export type DeliveryMode = 'freeform' | 'template';

/**
 * The only thing this module needs to know about a recipient. Declaring it here rather
 * than importing the `User` entity keeps WhatsAppModule independent of UsersModule.
 */
export interface WhatsAppRecipient {
  id: string;
  phoneNumber: string;
  lastInboundMessageAt: Date | null;
}

export interface SendTextMessageResult {
  deliveryMode: DeliveryMode;
}

const GRAPH_BASE_URL = 'https://graph.facebook.com';
/** WhatsApp only allows free-form replies within 24h of the contact's last inbound message. */
const SESSION_WINDOW_HOURS = 24;
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Owns every Meta Cloud API detail — Graph URLs, access token, template names.
 * Nothing outside this module should know those exist.
 */
@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);

  private readonly phoneNumberId: string;
  private readonly accessToken: string;
  private readonly apiVersion: string;
  private readonly fallbackTemplateName: string;
  private readonly fallbackTemplateLanguage: string;

  // Explicit @Inject: see AppController's constructor comment — this whole module tree
  // also runs under `tsx` (agent-worker), which doesn't emit DI-reflection metadata.
  constructor(
    @Inject(ConfigService) configService: ConfigService,
    @InjectRepository(WhatsAppMessage)
    private readonly messagesRepository: Repository<WhatsAppMessage>,
  ) {
    this.phoneNumberId = configService.getOrThrow<string>('WHATSAPP_PHONE_NUMBER_ID');
    this.accessToken = configService.getOrThrow<string>('WHATSAPP_ACCESS_TOKEN');
    this.apiVersion = configService.getOrThrow<string>('WHATSAPP_API_VERSION');
    this.fallbackTemplateName = configService.getOrThrow<string>('WHATSAPP_FALLBACK_TEMPLATE_NAME');
    this.fallbackTemplateLanguage = configService.getOrThrow<string>(
      'WHATSAPP_FALLBACK_TEMPLATE_LANGUAGE',
    );
  }

  /** AC-33: that User's logged sends, most-recent-first. */
  listMessages(userId: string): Promise<WhatsAppMessage[]> {
    return this.messagesRepository.find({ where: { userId }, order: { createdAt: 'DESC' } });
  }

  /** AC-9 / AC-10: null or older than 24h means the free-form window is closed. */
  isWithinSessionWindow(lastInboundMessageAt: Date | null, now: Date = new Date()): boolean {
    if (!lastInboundMessageAt) {
      return false;
    }

    return isBefore(now, addHours(lastInboundMessageAt, SESSION_WINDOW_HOURS));
  }

  /**
   * Sends `body` as a free-form text when the recipient's 24h session window is open,
   * and falls back to the configured approved template when it isn't (AC-8..AC-10).
   */
  async sendTextMessage(
    recipient: WhatsAppRecipient,
    body: string,
  ): Promise<SendTextMessageResult> {
    const deliveryMode: DeliveryMode = this.isWithinSessionWindow(recipient.lastInboundMessageAt)
      ? 'freeform'
      : 'template';
    // AC-32: the content actually sent — the typed body for freeform, the template name
    // otherwise (the template's own text isn't known to this service).
    const content = deliveryMode === 'freeform' ? body : this.fallbackTemplateName;

    try {
      if (deliveryMode === 'freeform') {
        await this.sendFreeformText(recipient.phoneNumber, body);
      } else {
        await this.sendTemplateMessage(recipient.phoneNumber);
      }

      await this.logMessage(recipient, content, deliveryMode, 'sent');
      return { deliveryMode };
    } catch (error) {
      // AC-32: logged even when the send attempt fails.
      await this.logMessage(recipient, content, deliveryMode, 'failed');
      throw error;
    }
  }

  private async logMessage(
    recipient: WhatsAppRecipient,
    content: string,
    deliveryMode: DeliveryMode,
    status: 'sent' | 'failed',
  ): Promise<void> {
    const entry = this.messagesRepository.create({
      userId: recipient.id,
      phoneNumber: recipient.phoneNumber,
      content,
      deliveryMode,
      status,
    });

    await this.messagesRepository.save(entry);
  }

  private sendFreeformText(phoneNumber: string, body: string): Promise<void> {
    return this.postMessage({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: toGraphRecipient(phoneNumber),
      type: 'text',
      text: { preview_url: false, body },
    });
  }

  private sendTemplateMessage(phoneNumber: string): Promise<void> {
    return this.postMessage({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: toGraphRecipient(phoneNumber),
      type: 'template',
      template: {
        name: this.fallbackTemplateName,
        language: { code: this.fallbackTemplateLanguage },
      },
    });
  }

  private async postMessage(payload: Record<string, unknown>): Promise<void> {
    const url = `${GRAPH_BASE_URL}/${this.apiVersion}/${this.phoneNumberId}/messages`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      // AC-14: a timeout or transport failure is handled exactly like a non-2xx response.
      this.logger.error(`WhatsApp Cloud API request failed: ${describeError(error)}`);
      throw new BadGatewayException('Failed to deliver the WhatsApp message');
    }

    if (!response.ok) {
      // AC-13: full detail stays server-side (it can contain token/account internals);
      // the caller only learns that delivery failed.
      const detail = await response.text().catch(() => '<unreadable response body>');
      this.logger.error(`WhatsApp Cloud API responded ${response.status}: ${detail}`);
      throw new BadGatewayException('Failed to deliver the WhatsApp message');
    }
  }
}

/** Meta's Graph API expects the E.164 number without the leading `+`. */
function toGraphRecipient(phoneNumber: string): string {
  return phoneNumber.replace(/^\+/, '');
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }

  return String(error);
}
