import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { UpdateAgentSettingsDto } from './dto/update-agent-settings.dto.js';
import { AgentSettings } from './entities/agent-settings.entity.js';

/** There is exactly one row, always read/written at this fixed id. */
const SETTINGS_ROW_ID = 'default';

/** AC-2: served whenever no prompt has ever been saved. */
export const DEFAULT_SYSTEM_PROMPT =
  'You are a friendly outbound voice agent calling on behalf of our business. Greet the ' +
  'person who picks up, briefly introduce yourself and what is new with our services, and ' +
  'offer to help or answer questions. Keep turns short and natural for a phone call, and ' +
  'end the call politely once the conversation has run its course.';

/**
 * Owns the single global `AgentSettings` row that governs every call's system prompt
 * (SPEC-02 AC-1..AC-5). `getActivePrompt` is what `CallsService` snapshots at call start.
 */
@Injectable()
export class AgentSettingsService {
  constructor(
    @InjectRepository(AgentSettings)
    private readonly settingsRepository: Repository<AgentSettings>,
  ) {}

  /** AC-1 / AC-2: the saved settings, or a transient (not persisted) default. */
  async get(): Promise<AgentSettings> {
    const existing = await this.settingsRepository.findOne({ where: { id: SETTINGS_ROW_ID } });
    if (existing) {
      return existing;
    }

    return { id: SETTINGS_ROW_ID, systemPrompt: DEFAULT_SYSTEM_PROMPT, updatedAt: new Date() };
  }

  /** What a newly placed call should snapshot as its active prompt (AC-5). */
  async getActivePrompt(): Promise<string> {
    return (await this.get()).systemPrompt;
  }

  /** AC-3: persists the new prompt, creating the row on first write. */
  async update(dto: UpdateAgentSettingsDto): Promise<AgentSettings> {
    const entity = this.settingsRepository.create({
      id: SETTINGS_ROW_ID,
      systemPrompt: dto.systemPrompt,
    });

    return this.settingsRepository.save(entity);
  }
}
