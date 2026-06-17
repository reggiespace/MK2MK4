import "server-only";

/**
 * Centralized, lazily-validated environment access (server-only).
 * Core vars are required; provider keys are optional and validated at point of
 * use so the app can boot for local development without every integration set.
 */

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v;
}

function optional(name: string): string | undefined {
  const v = process.env[name];
  return v && v.length > 0 ? v : undefined;
}

export const env = {
  databaseUrl: () => required("DATABASE_URL"),
  redisUrl: () => process.env.REDIS_URL ?? "redis://localhost:6379",
  sessionSecret: () => required("SESSION_SECRET"),

  openaiApiKey: () => optional("OPENAI_API_KEY"),
  openaiModel: () => process.env.OPENAI_MODEL ?? "gpt-4o",

  falKey: () => optional("FAL_KEY"),
  elevenLabsApiKey: () => optional("ELEVENLABS_API_KEY"),
  elevenLabsVoiceBrMale: () => optional("ELEVENLABS_VOICE_ID_BR_MALE"),
  elevenLabsVoiceBrFemale: () => optional("ELEVENLABS_VOICE_ID_BR_FEMALE"),
  elevenLabsVoiceUsMale: () => optional("ELEVENLABS_VOICE_ID_US_MALE"),
  elevenLabsVoiceUsFemale: () => optional("ELEVENLABS_VOICE_ID_US_FEMALE"),

  bufferApiKey: () => optional("BUFFER_API_KEY"),
  bufferOrgId: () => optional("BUFFER_ORG_ID"),
  zernioApiKey: () => optional("ZERNIO_API_KEY"),
  zernioBaseUrl: () => process.env.ZERNIO_BASE_URL ?? "https://api.zernio.com",

  workerBaseUrl: () => optional("WORKER_BASE_URL") ?? "http://localhost:8000",
  workerSharedSecret: () => optional("WORKER_SHARED_SECRET"),

  storageDir: () => process.env.STORAGE_DIR ?? "./storage",
  publicMediaBaseUrl: () =>
    process.env.PUBLIC_MEDIA_BASE_URL ?? "http://localhost:3000/media",
};

/** Snapshot of which integrations are configured (for the Settings screen). */
export function integrationStatus() {
  return {
    openai: Boolean(optional("OPENAI_API_KEY")),
    fal: Boolean(optional("FAL_KEY")),
    elevenlabs: Boolean(optional("ELEVENLABS_API_KEY")),
    voices: Boolean(
      optional("ELEVENLABS_VOICE_ID_BR_MALE") &&
        optional("ELEVENLABS_VOICE_ID_BR_FEMALE") &&
        optional("ELEVENLABS_VOICE_ID_US_MALE") &&
        optional("ELEVENLABS_VOICE_ID_US_FEMALE"),
    ),
    buffer: Boolean(optional("BUFFER_API_KEY")),
    zernio: Boolean(optional("ZERNIO_API_KEY")),
  };
}
