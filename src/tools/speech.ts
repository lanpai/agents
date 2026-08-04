import type { Humanoid } from "../humanoid";
import {
  getSpeechMode,
  isSpeechLanguage,
  SPEECH_LANGUAGE_NAMES,
  type SpeechLanguage,
} from "../speechLanguage";
import { roommateNames } from "./shared";

export const ROOM_AUDIENCE = "everyone in the room";

export function speechLanguageFor(
  humanoid: Humanoid,
  value: unknown,
): SpeechLanguage {
  if (getSpeechMode() === "presentation") return "en";
  return isSpeechLanguage(value) && humanoid.character.language.known.includes(value)
    ? value
    : humanoid.character.language.native;
}

export function speechAudienceFor(
  humanoid: Humanoid,
  world: Humanoid[],
  value: unknown,
): string {
  const listeners = roommateNames(humanoid, world);
  return typeof value === "string" && listeners.includes(value)
    ? value
    : ROOM_AUDIENCE;
}

export function speechToolFields(humanoid: Humanoid, world: Humanoid[]) {
  const listeners = roommateNames(humanoid, world);
  const languages =
    getSpeechMode() === "presentation"
      ? (["en"] as const)
      : humanoid.character.language.known;
  return {
    language: {
      type: "string" as const,
      enum: [...languages],
      description:
        `The language of the message (${languages
          .map((language) => `${language}=${SPEECH_LANGUAGE_NAMES[language]}`)
          .join(", ")}). ` +
        (getSpeechMode() === "presentation"
          ? "Presentation mode requires English."
          : "When replying, match the other person's most recent language when you can; otherwise follow your native and group-language rules."),
    },
    addressing: {
      type: "string" as const,
      enum: [ROOM_AUDIENCE, ...listeners],
      description:
        "Who this line is primarily addressed to. Everyone in earshot still hears it.",
    },
  };
}
