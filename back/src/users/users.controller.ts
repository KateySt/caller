import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SendSmsDto } from '../sms/dto/send-sms.dto.js';
import { SmsMessageResponseDto } from '../sms/dto/sms-message-response.dto.js';
import { SmsService } from '../sms/sms.service.js';
import { ListTelegramMessagesQueryDto } from '../telegram/dto/list-telegram-messages-query.dto.js';
import { SendTelegramMessageDto } from '../telegram/dto/send-telegram-message.dto.js';
import {
  TelegramInviteResponseDto,
  TelegramMessageResponseDto,
  TelegramMessagesPageResponseDto,
  TelegramStatusResponseDto,
} from '../telegram/dto/telegram-responses.dto.js';
import { TelegramLinkService } from '../telegram/telegram-link.service.js';
import { TelegramService } from '../telegram/telegram.service.js';
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
  // also runs under Vitest (esbuild), which doesn't emit DI-reflection metadata.
  constructor(
    @Inject(UsersService) private readonly usersService: UsersService,
    @Inject(WhatsAppService) private readonly whatsAppService: WhatsAppService,
    @Inject(SmsService) private readonly smsService: SmsService,
    @Inject(TelegramService) private readonly telegramService: TelegramService,
    @Inject(TelegramLinkService) private readonly telegramLinkService: TelegramLinkService,
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

  @Post(':id/telegram-invite')
  @ApiOperation({
    summary: 'Generate a single-use Telegram invitation link for a contact',
    description:
      'Valid 7 days. The raw link is returned only here. Any earlier unused invitation for the contact stops working.',
  })
  @ApiResponse({ status: HttpStatus.CREATED, type: TelegramInviteResponseDto })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'No such contact' })
  async createTelegramInvite(@Param('id') id: string): Promise<TelegramInviteResponseDto> {
    await this.usersService.findOne(id);

    return TelegramInviteResponseDto.fromInvite(await this.telegramLinkService.createInvite(id));
  }

  @Get(':id/telegram')
  @ApiOperation({ summary: "A contact's Telegram link status" })
  @ApiResponse({ status: HttpStatus.OK, type: TelegramStatusResponseDto })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'No such contact' })
  async getTelegramStatus(@Param('id') id: string): Promise<TelegramStatusResponseDto> {
    await this.usersService.findOne(id);

    return TelegramStatusResponseDto.fromInfo(await this.telegramLinkService.getStatus(id));
  }

  @Get(':id/telegram-messages')
  @ApiOperation({ summary: "A contact's Telegram conversation, oldest-first (most recent window)" })
  @ApiResponse({ status: HttpStatus.OK, type: TelegramMessagesPageResponseDto })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'No such contact' })
  async findTelegramMessages(
    @Param('id') id: string,
    @Query() query: ListTelegramMessagesQueryDto,
  ): Promise<TelegramMessagesPageResponseDto> {
    await this.usersService.findOne(id);
    const page = await this.telegramService.listMessages(id, query.limit, query.before);

    return TelegramMessagesPageResponseDto.fromPage(page);
  }

  @Post(':id/telegram-messages')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send a text message to a contact over Telegram' })
  @ApiResponse({ status: HttpStatus.OK, type: TelegramMessageResponseDto })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'No such contact' })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Contact is not linked, opted out, or unreachable',
  })
  @ApiResponse({ status: HttpStatus.BAD_GATEWAY, description: 'Telegram rejected it' })
  async sendTelegramMessage(
    @Param('id') id: string,
    @Body() dto: SendTelegramMessageDto,
  ): Promise<TelegramMessageResponseDto> {
    // An unknown id never reaches Telegram (AC-25).
    await this.usersService.findOne(id);
    const message = await this.telegramService.sendOperatorMessage(id, dto.text);

    return TelegramMessageResponseDto.fromEntity(message);
  }

  @Delete(':id/telegram-messages')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "Delete a contact's logged Telegram messages",
    description: 'Link and opt-out status are unchanged.',
  })
  @ApiResponse({ status: HttpStatus.NO_CONTENT })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'No such contact' })
  async deleteTelegramMessages(@Param('id') id: string): Promise<void> {
    await this.usersService.findOne(id);
    await this.telegramService.deleteMessages(id);
  }
}
