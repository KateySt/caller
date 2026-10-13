import { IsIn, IsNotEmpty, IsString, ValidateIf } from 'class-validator';
import type { AgentTestEndReason, AgentTestStatus } from '../entities/agent-test-session.entity.js';

/** What the agent needs to run a dispatched test session — same shape as `AgentCallContextDto`. */
export class AgentTestContextDto {
  id: string;
  status: AgentTestStatus;
  systemPrompt: string;
}

/** `admin_ended` is not accepted here — only the admin's own end request sets it. */
export type AgentReportedTestEndReason = Exclude<AgentTestEndReason, 'admin_ended'>;

export class EndAgentTestDto {
  @IsIn(['completed', 'failed'])
  status: 'completed' | 'failed';

  @ValidateIf((dto: EndAgentTestDto) => dto.status === 'completed')
  @IsIn(['agent_completed', 'admin_disconnected', 'admin_unresponsive', 'max_duration_reached'])
  endReason?: AgentReportedTestEndReason;

  @ValidateIf((dto: EndAgentTestDto) => dto.status === 'failed')
  @IsString()
  @IsNotEmpty()
  failureReason?: string;
}
