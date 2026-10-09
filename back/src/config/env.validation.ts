import { Transform, Type, plainToInstance } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  Min,
  MinLength,
  ValidateIf,
  validateSync,
} from 'class-validator';

/** `KEY=` in a .env file arrives as an empty string; treat it as unset. */
const emptyToUndefined = ({ value }: { value: unknown }) => (value === '' ? undefined : value);

enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

class EnvironmentVariables {
  @IsEnum(Environment)
  @IsOptional()
  NODE_ENV: Environment = Environment.Development;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(65535)
  @IsOptional()
  PORT: number = 3001;

  @IsString()
  @IsOptional()
  CORS_ORIGIN: string = 'http://localhost:3000';

  @IsString()
  @IsOptional()
  DATABASE_HOST: string = 'localhost';

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(65535)
  @IsOptional()
  DATABASE_PORT: number = 5432;

  @IsString()
  @IsOptional()
  DATABASE_USER: string = 'caller';

  @IsString()
  @IsOptional()
  DATABASE_PASSWORD: string = 'caller';

  @IsString()
  @IsOptional()
  DATABASE_NAME: string = 'caller';

  /** `true` for hosted Postgres that requires TLS (e.g. Neon); local docker-compose Postgres has none. */
  @Transform(({ value }) => (typeof value === 'string' ? value.toLowerCase() === 'true' : value))
  @IsBoolean()
  @IsOptional()
  DATABASE_SSL: boolean = false;

  // --- WhatsApp Cloud API (SPEC-01 AC-23..AC-25) ---

  @IsString()
  @IsNotEmpty()
  WHATSAPP_PHONE_NUMBER_ID: string;

  @IsString()
  @IsNotEmpty()
  WHATSAPP_ACCESS_TOKEN: string;

  @IsString()
  @IsOptional()
  WHATSAPP_API_VERSION: string = 'v21.0';

  @IsString()
  @IsNotEmpty()
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: string;

  @IsString()
  @IsNotEmpty()
  WHATSAPP_FALLBACK_TEMPLATE_NAME: string;

  @IsString()
  @IsOptional()
  WHATSAPP_FALLBACK_TEMPLATE_LANGUAGE: string = 'en_US';

  // --- LiveKit (LiveKit Cloud project) ---

  @IsUrl({ protocols: ['ws', 'wss', 'http', 'https'], require_tld: false })
  LIVEKIT_URL: string;

  @IsString()
  @IsNotEmpty()
  LIVEKIT_API_KEY: string;

  @IsString()
  @IsNotEmpty()
  LIVEKIT_API_SECRET: string;

  // --- PSTN AI calling agent (SPEC-02 AC-22/AC-23) ---

  /** ID of the stored LiveKit outbound SIP trunk (created ahead of time, e.g. via `lk sip`). */
  @IsString()
  @IsNotEmpty()
  LIVEKIT_SIP_TRUNK_ID: string;

  /** Explicit agent-dispatch name; must match `AGENT_NAME` in `agent/src/main.ts`. */
  @IsString()
  @IsOptional()
  LIVEKIT_AGENT_NAME: string = 'caller-voice-agent';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  CALL_MAX_DURATION_SECONDS: number = 600;

  /** Shared secret the voice agent (`agent/`) sends to `/api/internal/calls`; same value as its secret. */
  @IsString()
  @MinLength(32)
  AGENT_INTERNAL_TOKEN: string;

  // --- SMS (SPEC-03 AC-8) ---

  @IsString()
  @IsNotEmpty()
  TWILIO_ACCOUNT_SID: string;

  @IsString()
  @IsNotEmpty()
  TWILIO_AUTH_TOKEN: string;

  @IsString()
  @IsNotEmpty()
  TWILIO_SMS_FROM_NUMBER: string;

  // --- Telegram bot (back SPEC-04 AC-36) ---

  /** Secret: BotFather token. Never logged, returned, or persisted. */
  @IsString()
  @IsNotEmpty()
  TELEGRAM_BOT_TOKEN: string;

  /** Without the leading `@`; used to build `https://t.me/<username>?start=<token>`. */
  @IsString()
  @IsNotEmpty()
  TELEGRAM_BOT_USERNAME: string;

  /** Full public URL of `POST /api/telegram/webhook`. Unset: long polling (local dev). */
  @IsUrl({ protocols: ['https'], require_tld: true })
  @Transform(emptyToUndefined)
  @IsOptional()
  TELEGRAM_WEBHOOK_URL?: string;

  /** Required only when `TELEGRAM_WEBHOOK_URL` is set (Telegram: 1-256 chars of `A-Za-z0-9_-`). */
  @Transform(emptyToUndefined)
  @ValidateIf((env: EnvironmentVariables) => Boolean(env.TELEGRAM_WEBHOOK_URL))
  @Matches(/^[A-Za-z0-9_-]{1,256}$/)
  TELEGRAM_WEBHOOK_SECRET?: string;

  @IsUrl({ protocols: ['https'], require_protocol: true })
  @Transform(emptyToUndefined)
  @IsOptional()
  TELEGRAM_PRIVACY_POLICY_URL?: string;
}

export function validate(config: Record<string, unknown>): EnvironmentVariables {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validatedConfig, { skipMissingProperties: false });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }

  return validatedConfig;
}
