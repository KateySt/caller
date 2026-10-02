import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SendSmsDto } from '../sms/dto/send-sms.dto.js';
import { SmsMessageResponseDto } from '../sms/dto/sms-message-response.dto.js';
import { SmsService } from '../sms/sms.service.js';
import { WhatsAppService } from '../whatsapp/whatsapp.service.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { SendMessageResponseDto } from './dto/send-message-response.dto.js';
import { SendMessageDto } from './dto/send-message.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { UserResponseDto } from './dto/user-response.dto.js';
import { WhatsAppMessageResponseDto } from './dto/whatsapp-message-response.dto.js';
import { UsersService } from './users.service.js';

@ApiTags('users')
@Controller('users')
export class UsersController {
  // Explicit @Inject: see AppController's constructor comment — this whole module tree
  // also runs under `tsx` (agent-worker), which doesn't emit DI-reflection metadata.
  constructor(
    @Inject(UsersService) private readonly usersService: UsersService,
    @Inject(WhatsAppService) private readonly whatsAppService: WhatsAppService,
    @Inject(SmsService) private readonly smsService: SmsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List all contacts' })
  @ApiResponse({ status: HttpStatus.OK, type: [UserResponseDto] })
  async findAll(): Promise<UserResponseDto[]> {
    const users = await this.usersService.findAll();

    return users.map((user) => UserResponseDto.fromEntity(user));
  }

  @Post()
  @ApiOperation({ summary: 'Register a contact' })
  @ApiResponse({ status: HttpStatus.CREATED, type: UserResponseDto })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'Phone number already registered' })
  async create(@Body() dto: CreateUserDto): Promise<UserResponseDto> {
    const user = await this.usersService.create(dto);

    return UserResponseDto.fromEntity(user);
  }

  @Patch(':id')
  @ApiOperation({ summary: "Update a contact's name and/or phone number" })
  @ApiResponse({ status: HttpStatus.OK, type: UserResponseDto })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'No such contact' })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'Phone number already registered' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ): Promise<UserResponseDto> {
    const user = await this.usersService.update(id, dto);

    return UserResponseDto.fromEntity(user);
  }

  @Post(':id/messages')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Send a WhatsApp text message to a contact',
    description:
      'Delivers `body` as free-form text when the contact messaged within the last 24 hours, ' +
      'otherwise falls back to the configured approved template. The response says which ran.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: SendMessageResponseDto })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'No such contact' })
  @ApiResponse({ status: HttpStatus.BAD_GATEWAY, description: 'WhatsApp Cloud API rejected it' })
  async sendMessage(
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
  ): Promise<SendMessageResponseDto> {
    // Resolving the user first means an unknown id never reaches the Cloud API (AC-11).
    const user = await this.usersService.findOne(id);

    return this.whatsAppService.sendTextMessage(user, dto.body);
  }

  @Get(':id/whatsapp-messages')
  @ApiOperation({ summary: "List a contact's WhatsApp send history, most-recent-first" })
  @ApiResponse({ status: HttpStatus.OK, type: [WhatsAppMessageResponseDto] })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'No such contact' })
  async findWhatsAppMessages(@Param('id') id: string): Promise<WhatsAppMessageResponseDto[]> {
    await this.usersService.findOne(id);
    const messages = await this.whatsAppService.listMessages(id);

    return messages.map((message) => WhatsAppMessageResponseDto.fromEntity(message));
  }

  @Post(':id/sms-messages')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send a plain SMS to a contact, independent of WhatsApp' })
  @ApiResponse({ status: HttpStatus.OK, type: SmsMessageResponseDto })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'No such contact' })
  @ApiResponse({ status: HttpStatus.BAD_GATEWAY, description: 'The SMS provider rejected it' })
  async sendSms(
    @Param('id') id: string,
    @Body() dto: SendSmsDto,
  ): Promise<SmsMessageResponseDto> {
    // AC-2: resolving the user first means an unknown id never reaches the SMS provider.
    const user = await this.usersService.findOne(id);
    const message = await this.smsService.sendSms(user, dto.body);

    return SmsMessageResponseDto.fromEntity(message);
  }

  @Get(':id/sms-messages')
  @ApiOperation({ summary: "List a contact's SMS send history, most-recent-first" })
  @ApiResponse({ status: HttpStatus.OK, type: [SmsMessageResponseDto] })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'No such contact' })
  async findSmsMessages(@Param('id') id: string): Promise<SmsMessageResponseDto[]> {
    await this.usersService.findOne(id);
    const messages = await this.smsService.listMessages(id);

    return messages.map((message) => SmsMessageResponseDto.fromEntity(message));
  }
}
