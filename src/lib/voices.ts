/**
 * Premade voices confirmed on this ElevenLabs account. Env vars override the IDs.
 * eleven_flash_v2_5 applies stability, similarity_boost, speed, and speaker boost.
 * Style exaggeration is a Multilingual v2 control, so these presets do not send it.
 */
export const COACH_VOICES = {
  supportive: {
    id: "EXAVITQu4vr4xnSDxMaL",
    name: "Sarah",
    stability: 0.55,
    similarityBoost: 0.82,
    speed: 0.96,
  },
  drill: {
    id: "N2lVS1w4EtoT3dr4eOWO",
    name: "Callum",
    stability: 0.4,
    similarityBoost: 0.88,
    speed: 0.96,
  },
  hype: {
    id: "IKne3meq5aSn9XLyUdCD",
    name: "Charlie",
    stability: 0.4,
    similarityBoost: 0.78,
    speed: 1.05,
  },
  calm: {
    id: "SAz9YHcvj6GT2YYXdXww",
    name: "River",
    stability: 0.8,
    similarityBoost: 0.84,
    speed: 0.88,
  },
  dry: {
    id: "JBFqnCBsd6RMkjVDRZzb",
    name: "George",
    stability: 0.7,
    similarityBoost: 0.75,
    speed: 1,
  },
  documentary: {
    id: "onwK4e9ZLuTAKqWW03F9",
    name: "Daniel",
    stability: 0.74,
    similarityBoost: 0.78,
    speed: 0.96,
  },
} as const;

export type VoicePersonality = keyof typeof COACH_VOICES;
