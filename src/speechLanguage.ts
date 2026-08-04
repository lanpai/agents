export const SPEECH_LANGUAGES = ["en", "ja", "zh"] as const;

export type SpeechLanguage = (typeof SPEECH_LANGUAGES)[number];
export type SpeechMode = "presentation" | "character";

export const SPEECH_LANGUAGE_NAMES = {
  en: "English",
  ja: "Japanese",
  zh: "Chinese",
} as const satisfies Record<SpeechLanguage, string>;

const MODE_KEY = "sim:speech-language-mode";
const CROSS_LANGUAGE_EMOTION_KEY = "sim:cross-language-emotion";

export function speechModeFromStored(value: string | null): SpeechMode {
  return value === "presentation" ? "presentation" : "character";
}

export function crossLanguageEmotionFromStored(value: string | null): boolean {
  return value !== "false";
}

export function getSpeechMode(): SpeechMode {
  return speechModeFromStored(localStorage.getItem(MODE_KEY));
}

export function setSpeechMode(mode: SpeechMode): SpeechMode {
  localStorage.setItem(MODE_KEY, mode);
  return mode;
}

export function getCrossLanguageEmotion(): boolean {
  return crossLanguageEmotionFromStored(
    localStorage.getItem(CROSS_LANGUAGE_EMOTION_KEY),
  );
}

export function setCrossLanguageEmotion(enabled: boolean): boolean {
  localStorage.setItem(CROSS_LANGUAGE_EMOTION_KEY, String(enabled));
  return enabled;
}

export function isSpeechLanguage(value: unknown): value is SpeechLanguage {
  return (SPEECH_LANGUAGES as readonly unknown[]).includes(value);
}

export function mutuallyUnderstoodLanguages(
  speakerLanguages: readonly SpeechLanguage[],
  nativeLanguage: SpeechLanguage,
  audienceLanguages: readonly (readonly SpeechLanguage[])[],
): SpeechLanguage[] {
  if (audienceLanguages.length === 0) return [nativeLanguage];
  const mutual = speakerLanguages.filter((language) =>
    audienceLanguages.every((languages) => languages.includes(language)),
  );
  // Some pairs have no shared language (for example Hirai and an English-only
  // character). They still speak their only/native language; the listener is
  // explicitly told that they could not understand it.
  return mutual.length > 0 ? mutual : [nativeLanguage];
}
