import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentSettingsModule } from './agent-settings/agent-settings.module.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { CallsModule } from './calls/calls.module.js';
import { validate } from './config/env.validation.js';
import { LiveKitModule } from './livekit/livekit.module.js';
import { UsersModule } from './users/users.module.js';
import { WhatsAppWebhookModule } from './whatsapp/webhook/whatsapp-webhook.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
      validate,
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres' as const,
        host: configService.getOrThrow<string>('DATABASE_HOST'),
        port: configService.getOrThrow<number>('DATABASE_PORT'),
        username: configService.getOrThrow<string>('DATABASE_USER'),
        password: configService.getOrThrow<string>('DATABASE_PASSWORD'),
        database: configService.getOrThrow<string>('DATABASE_NAME'),
        ssl: configService.get<boolean>('DATABASE_SSL') ?? false,
        autoLoadEntities: true,
        synchronize: false,
      }),
    }),
    UsersModule,
    WhatsAppWebhookModule,
    LiveKitModule,
    AgentSettingsModule,
    CallsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
