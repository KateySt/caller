import { ApiProperty } from '@nestjs/swagger';
import type { Call, CallEndReason, CallStatus, CallTranscriptTurn } from '../entities/call.entity.js';

export class CallTranscriptTurnDto {
  @ApiProperty({ enum: ['callee', 'agent'] })
  role: 'callee' | 'agent';

  @ApiProperty()
  text: string;

  @ApiProperty({ format: 'date-time' })
  at: string;
}

/** A call attempt and its current status/transcript (SPEC-02 AC-9, AC-10). */
export class CallResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: '+380501234567' })
  phoneNumber: string;

  @ApiProperty({ enum: ['in_progress', 'completed', 'failed'] })
  status: CallStatus;

  @ApiProperty({ enum: ['agent_completed', 'callee_hangup', 'callee_unresponsive', 'max_duration_reached'], nullable: true })
  endReason: CallEndReason | null;

  @ApiProperty({ nullable: true })
  failureReason: string | null;

  @ApiProperty({ type: [CallTranscriptTurnDto] })
  transcript: CallTranscriptTurn[];

  @ApiProperty({ format: 'date-time' })
  startedAt: Date;

  @ApiProperty({ format: 'date-time', nullable: true })
  endedAt: Date | null;

  @ApiProperty({ nullable: true })
  durationSeconds: number | null;

  static fromEntity(call: Call): CallResponseDto {
    return {
      id: call.id,
      phoneNumber: call.phoneNumber,
      status: call.status,
      endReason: call.endReason,
      failureReason: call.failureReason,
      transcript: call.transcript.map(({ role, text, at }) => ({ role, text, at })),
      startedAt: call.startedAt,
      endedAt: call.endedAt,
      durationSeconds: call.durationSeconds,
    };
  }
}
