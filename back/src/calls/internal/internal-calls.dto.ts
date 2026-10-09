import { IsIn, IsInt, IsISO8601, IsNotEmpty, IsString, Min, ValidateIf } from 'class-validator';
import type { CallEndReason, CallStatus } from '../entities/call.entity.js';

/** What the agent needs to run a dispatched call. */
export class AgentCallContextDto {
  id: string;
  status: CallStatus;
  systemPrompt: string;
}

export class AppendTranscriptTurnDto {
  /** Per-call turn counter from the agent; makes retried appends idempotent. */
  @IsInt()
  @Min(0)
  seq: number;

  @IsIn(['callee', 'agent'])
  role: 'callee' | 'agent';

  @IsString()
  @IsNotEmpty()
  text: string;

  @IsISO8601()
  at: string;
}

export class EndCallDto {
  @IsIn(['completed', 'failed'])
  status: 'completed' | 'failed';

  @ValidateIf((dto: EndCallDto) => dto.status === 'completed')
  @IsIn(['agent_completed', 'callee_hangup', 'callee_unresponsive', 'max_duration_reached'])
  endReason?: CallEndReason;

  @ValidateIf((dto: EndCallDto) => dto.status === 'failed')
  @IsString()
  @IsNotEmpty()
  failureReason?: string;
}
