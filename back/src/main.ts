import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { RequestHandler } from 'express';
import helmetImport, { type HelmetOptions } from 'helmet';
import { AppModule } from './app.module.js';
import { TelegramUpdatesService } from './telegram/telegram-updates.service.js';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';

// helmet ships separate ESM/CJS typings. Vercel's NestJS builder type-checks against the CJS
// ones, where the default import is the module namespace instead of the function (TS2349),
// so unwrap `.default` when present — correct at runtime under either module format.
const helmet = ((helmetImport as unknown as { default?: unknown }).default ?? helmetImport) as (
  options?: HelmetOptions,
) => RequestHandler;

/** Builds the fully configured app without binding a port — shared by both entry modes below. */
async function createApp(): Promise<NestExpressApplication> {
  // `rawBody` keeps the untouched request bytes around: LiveKit signs its webhooks over
  // them, and verifying against the parsed object would always fail.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  const configService = app.get(ConfigService);

  // LiveKit posts webhooks as `application/webhook+json`. Without this, no parser matches,
  // `req.rawBody` is never populated, and signature verification silently breaks.
  app.useBodyParser('json', { type: ['application/json', 'application/webhook+json'] });

  app.use(helmet());
  app.enableCors({
    origin: configService.get<string>('CORS_ORIGIN'),
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Caller API')
    .setDescription('API documentation')
    .setVersion('1.0')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  return app;
}

/** Long-running server (local dev, any VM/container host). */
async function bootstrap(): Promise<void> {
  const app = await createApp();
  const port = app.get(ConfigService).get<number>('PORT') ?? 3001;
  await app.listen(port);

  // Not a lifecycle hook: only the HTTP server may poll Telegram, not every AppModule consumer (e.g. e2e tests).
  await app.get(TelegramUpdatesService).start();
}

/**
 * Vercel (serverless). Its runtime patches `http.Server.listen` so the listen callback never
 * fires — `app.listen()` would hang the function until it times out. Instead this module
 * exports a request handler; Nest is initialised once per instance and reused across requests.
 */
let vercelApp: Promise<RequestHandler> | undefined;

async function initVercelApp(): Promise<RequestHandler> {
  const app = await createApp();
  await app.init();

  const telegram = app.get(TelegramUpdatesService);
  if (telegram.isWebhookMode) {
    await telegram.start();
  } else {
    // A function instance can't hold a long-poll open between requests.
    new Logger('Bootstrap').warn('TELEGRAM_WEBHOOK_URL is not set: Telegram updates are disabled on Vercel');
  }

  return app.getHttpAdapter().getInstance() as RequestHandler;
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  vercelApp ??= initVercelApp().catch((error: unknown) => {
    vercelApp = undefined; // let the next request retry instead of caching the failure
    throw error;
  });
  const expressApp = await vercelApp;
  expressApp(req as Parameters<RequestHandler>[0], res as Parameters<RequestHandler>[1], () => undefined);
}

if (!process.env.VERCEL) {
  bootstrap().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
