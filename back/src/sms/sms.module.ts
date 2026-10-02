import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SmsMessage } from './entities/sms-message.entity.js';
import { SmsService } from './sms.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([SmsMessage])],
  providers: [SmsService],
  exports: [SmsService],
})
export class SmsModule {}
