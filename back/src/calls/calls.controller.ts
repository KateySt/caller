import { Controller, Get, HttpCode, HttpStatus, Inject, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CallsService } from './calls.service.js';
import { CallResponseDto } from './dto/call-response.dto.js';

@ApiTags('calls')
@Controller('users/:id/calls')
export class CallsController {
  // Explicit @Inject: see AppController's constructor comment — this whole module tree
  // also runs under Vitest (esbuild), which doesn't emit DI-reflection metadata.
  constructor(@Inject(CallsService) private readonly callsService: CallsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Place an outbound PSTN call to a contact',
    description:
      'Returns once dialing has started (status `in_progress`) — poll GET .../calls/:callId ' +
      'for live status and transcript.',
  })
  @ApiResponse({ status: HttpStatus.CREATED, type: CallResponseDto })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'No such contact' })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'A call to this contact is already in progress',
  })
  async create(@Param('id') id: string): Promise<CallResponseDto> {
    const call = await this.callsService.placeCall(id);

    return CallResponseDto.fromEntity(call);
  }

  @Get()
  @ApiOperation({ summary: "List a contact's calls, most-recent-first" })
  @ApiResponse({ status: HttpStatus.OK, type: [CallResponseDto] })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'No such contact' })
  async findAll(@Param('id') id: string): Promise<CallResponseDto[]> {
    const calls = await this.callsService.listForUser(id);

    return calls.map((call) => CallResponseDto.fromEntity(call));
  }

  @Get(':callId')
  @ApiOperation({ summary: 'Get one call, including its live transcript' })
  @ApiResponse({ status: HttpStatus.OK, type: CallResponseDto })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'No such contact or call' })
  async findOne(
    @Param('id') id: string,
    @Param('callId') callId: string,
  ): Promise<CallResponseDto> {
    const call = await this.callsService.findOneForUser(id, callId);

    return CallResponseDto.fromEntity(call);
  }
}
