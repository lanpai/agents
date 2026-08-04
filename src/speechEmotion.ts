import type { RoutedVoice } from "./characters/types";

export const ENGLISH_SPEECH_EMOTIONS = [
  "neutral",
  "triumphant_joy",
  "panic",
  "fury",
  "grief",
  "romantic",
] as const;
export const JAPANESE_SPEECH_EMOTIONS = [
  "neutral",
  "exaggerated_joy",
  "fear",
  "fury",
  "villainous_composure",
  "romantic",
] as const;
export const CHINESE_SPEECH_EMOTIONS = [
  "neutral",
  "ecstatic_joy",
  "terror",
  "villainous_sneer",
  "grief",
  "romantic",
] as const;

export const SPEECH_EMOTIONS = [
  ...new Set([
    ...ENGLISH_SPEECH_EMOTIONS,
    ...JAPANESE_SPEECH_EMOTIONS,
    ...CHINESE_SPEECH_EMOTIONS,
  ]),
] as const;

export type SpeechEmotion = (typeof SPEECH_EMOTIONS)[number];

const ENGLISH_VOICES = new Set<RoutedVoice>([
  "cory",
  "leland",
  "tiffany",
  "tyler",
  "yp",
]);
const CHINESE_VOICES = new Set<RoutedVoice>(["eric", "yanghua"]);

export function speechEmotionsForVoice(
  voice: RoutedVoice | undefined,
): readonly SpeechEmotion[] {
  if (voice && ENGLISH_VOICES.has(voice)) return ENGLISH_SPEECH_EMOTIONS;
  if (voice && CHINESE_VOICES.has(voice)) return CHINESE_SPEECH_EMOTIONS;
  if (voice === "hirai") return JAPANESE_SPEECH_EMOTIONS;
  return ["neutral"];
}

export function speechEmotionDescription(voice: RoutedVoice | undefined) {
  return `The emotion route for this specific line. Select only from this voice's available manifest routes: ${speechEmotionsForVoice(voice).join(", ")}. Use neutral for ordinary conversation or when none fits.`;
}

export function speechEmotion(
  value: unknown,
  voice: RoutedVoice | undefined,
): SpeechEmotion {
  const available = speechEmotionsForVoice(voice);
  return typeof value === "string" &&
    (available as readonly string[]).includes(value)
    ? (value as SpeechEmotion)
    : "neutral";
}
