import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { TelegramUpdatesService } from './telegram/telegram-updates.service.js';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';

async function bootstrap() {
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

  const port = configService.get<number>('PORT') ?? 3001;
  await app.listen(port);

  // Not a lifecycle hook: the agent worker reuses AppModule and must not poll Telegram.
  await app.get(TelegramUpdatesService).start();
}

await bootstrap();
