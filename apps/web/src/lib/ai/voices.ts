/**
 * Voice catalogue — client-safe.
 *
 * Kept apart from `lib/ai/voice.ts`, which is server-only: the wizard's Voice
 * tab needs this list in the browser, and importing the server module there
 * would drag Prisma and the credential store into the client bundle.
 */

export const VOICES = [
  { id: "9BWtsMINqrJLrRacOk9x", name: "Aria", desc: "Warm · calm · unhurried" },
  { id: "CwhRBWXzGAHq8TQ4Fs17", name: "Sage", desc: "Evidence-led · steady" },
  { id: "XrExE9yKIg1WjnnlVkGX", name: "Nova", desc: "Bright · upbeat" },
] as const;

export const DEFAULT_VOICE_ID = VOICES[0].id;
