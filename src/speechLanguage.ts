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

export function getSpeechMode(): SpeechMode {
  return localStorage.getItem(MODE_KEY) === "character"
    ? "character"
    : "presentation";
}

export function setSpeechMode(mode: SpeechMode): SpeechMode {
  localStorage.setItem(MODE_KEY, mode);
  return mode;
}

export function getCrossLanguageEmotion(): boolean {
  return localStorage.getItem(CROSS_LANGUAGE_EMOTION_KEY) === "true";
}

export function setCrossLanguageEmotion(enabled: boolean): boolean {
  localStorage.setItem(CROSS_LANGUAGE_EMOTION_KEY, String(enabled));
  return enabled;
}

export function isSpeechLanguage(value: unknown): value is SpeechLanguage {
  return (SPEECH_LANGUAGES as readonly unknown[]).includes(value);
}
