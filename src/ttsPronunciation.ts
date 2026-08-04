import type { SpeechLanguage } from "./speechLanguage";

// Written dialogue stays natural; these hints exist only in the string sent
// to TTS. Keep this deliberately small and explicit rather than trying to
// guess pronunciations from capitalization or spelling.
const ENGLISH_HINTS: readonly [RegExp, string][] = [
  [/\bHirai\b/gi, "heRAI"],
];

export function applyTtsPronunciationHints(
  text: string,
  language: SpeechLanguage,
): string {
  if (language !== "en") return text;
  return ENGLISH_HINTS.reduce(
    (spoken, [pattern, replacement]) => spoken.replace(pattern, replacement),
    text,
  );
}
