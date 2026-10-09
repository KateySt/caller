import { z } from 'zod';

/** `KEY=` in a .env file arrives as an empty string; treat it as unset so defaults apply. */
const optional = (fallback: string) =>
  z.preprocess((value) => (value === '' ? undefined : value), z.string().default(fallback));

/**
 * Validated once at module load, so a missing secret crashes the worker on boot instead of
 * failing mid-call. `LIVEKIT_URL`/`LIVEKIT_API_KEY`/`LIVEKIT_API_SECRET` are not listed:
 * LiveKit Cloud injects them at runtime and the agents CLI reads them itself.
 */
const envSchema = z.object({
  /** Dispatch name; must match `LIVEKIT_AGENT_NAME` in `back/`. */
  LIVEKIT_AGENT_NAME: optional('caller-voice-agent'),

  /** Public base URL of the API including the global prefix, e.g. `https://api.example.com/api`. */
  BACKEND_URL: z
    .string()
    .url()
    .transform((url) => url.replace(/\/+$/, '')),
  /** Same value as `AGENT_INTERNAL_TOKEN` in `back/`. */
  AGENT_INTERNAL_TOKEN: z.string().min(32),

  DEEPGRAM_API_KEY: z.string().min(1),
  /** Tuned for phone-call audio; see @livekit/agents-plugin-deepgram's STTModels. */
  DEEPGRAM_MODEL: optional('nova-2-phonecall'),

  ANTHROPIC_API_KEY: z.string().min(1),
  ANTHROPIC_MODEL: optional('claude-haiku-4-5-20251001'),

  ELEVENLABS_API_KEY: z.string().min(1),
  ELEVENLABS_VOICE_ID: z.string().min(1),
  /** Low-latency conversational model; see @livekit/agents-plugin-elevenlabs's TTSModels. */
  ELEVENLABS_MODEL: optional('eleven_turbo_v2_5'),

  /** Hang up once the callee has said nothing for this long (seconds). */
  CALLEE_SILENCE_TIMEOUT_SECONDS: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.coerce.number().int().positive().default(300),
  ),
});

export type AgentConfig = z.infer<typeof envSchema>;

function loadConfig(): AgentConfig {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    throw new Error(`Invalid agent environment:\n  ${issues.join('\n  ')}`);
  }

  return result.data;
}

export const config = loadConfig();
