import type { Humanoid } from "../humanoid";
import { roomOf } from "../locations";
import {
  getSpeechMode,
  isSpeechLanguage,
  sharedConversationLanguages,
  SPEECH_LANGUAGE_NAMES,
  type SpeechLanguage,
} from "../speechLanguage";
import { roommateNames } from "./shared";

export const ROOM_AUDIENCE = "everyone in the room";
export const SELF_AUDIENCE = "myself";

export function speechLanguageFor(
  humanoid: Humanoid,
  world: Humanoid[],
  value: unknown,
  addressing: string,
  includeAdjacent = false,
): SpeechLanguage {
  if (getSpeechMode() === "presentation") return "en";
  const languages =
    addressing === SELF_AUDIENCE
      ? [humanoid.character.language.native]
      : speechLanguagesForAudience(humanoid, world, includeAdjacent);
  return isSpeechLanguage(value) && languages.includes(value)
    ? value
    : languages[0]!;
}

function speechLanguagesForAudience(
  humanoid: Humanoid,
  world: Humanoid[],
  includeAdjacent = false,
): SpeechLanguage[] {
  const speakerRoom = roomOf(humanoid.x, humanoid.y);
  const audience = world
    .filter((other) => {
      if (other === humanoid || other.dead || other.escaped) return false;
      const listenerRoom = roomOf(other.x, other.y);
      return (
        listenerRoom === speakerRoom ||
        (includeAdjacent && speakerRoom.doors.includes(listenerRoom.name))
      );
    })
    .map((other) => other.character.language.known);
  return sharedConversationLanguages(
    humanoid.character.language.known,
    humanoid.character.language.native,
    audience,
  );
}

export function speechAudienceFor(
  humanoid: Humanoid,
  world: Humanoid[],
  value: unknown,
): string {
  const listeners = roommateNames(humanoid, world);
  return value === SELF_AUDIENCE
    ? SELF_AUDIENCE
    : typeof value === "string" && listeners.includes(value)
    ? value
    : ROOM_AUDIENCE;
}

export function speechToolFields(
  humanoid: Humanoid,
  world: Humanoid[],
  includeAdjacent = false,
) {
  const listeners = roommateNames(humanoid, world);
  const audienceLanguages =
    getSpeechMode() === "presentation"
      ? (["en"] as const)
      : speechLanguagesForAudience(humanoid, world, includeAdjacent);
  const languages = [
    ...new Set([
      ...audienceLanguages,
      ...(getSpeechMode() === "character"
        ? [humanoid.character.language.native]
        : []),
    ]),
  ];
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
          : `Everyone understands every language, but use a language everyone in earshot can also speak when possible; the shared conversational options are ${audienceLanguages.map((language) => SPEECH_LANGUAGE_NAMES[language]).join(", ")}. Use ${SPEECH_LANGUAGE_NAMES[humanoid.character.language.native]} when addressing myself.`),
    },
    addressing: {
      type: "string" as const,
      enum: [SELF_AUDIENCE, ROOM_AUDIENCE, ...listeners],
      description:
        "Who this line is primarily addressed to. Everyone in earshot still hears it.",
    },
  };
}
