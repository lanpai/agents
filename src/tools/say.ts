import { HOSTILITY_LEVELS } from "../anger";
import { simNow } from "../time";
import {
  speechEmotion,
  speechEmotionDescription,
  speechEmotionsForVoice,
} from "../speechEmotion";
import { roommateNames } from "./shared";
import type { SimTool } from "./types";
import {
  speechAudienceFor,
  speechLanguageFor,
  speechToolFields,
} from "./speech";
import { spokenMessageFromWritten } from "../spokenMessage";

// asked of every line: it costs nothing extra (the model is already writing
// this tool call) and it is what drives the anger gauge
export const HOSTILITY_FIELD = {
  type: "string",
  enum: HOSTILITY_LEVELS,
  description:
    'How this line is meant towards the people hearing it. "friendly" is warm or supportive, "neutral" is ordinary talk, "barbed" is a dig, a complaint or a pointed jab, "hostile" is an insult, an accusation or a threat. Judge the line itself, not your mood.',
} as const;

export const say: SimTool = {
  name: "say",
  definition: (humanoid, world) => {
    const listeners = roommateNames(humanoid, world);
    return {
      name: "say",
      description:
        (listeners.length > 0
          ? `Speak at conversational volume. Heard by ${listeners.join(", ")}.`
          : "Speak at conversational volume. No one else is in the room to hear you.") +
        " Speaking makes you stop moving.",
      input_schema: {
        type: "object",
        properties: {
          written_message: {
            type: "string",
            description:
              "What appears in the speech bubble and dialogue history, under 15 words, kept short and natural. Preserve normal written forms such as 5.0, SS+, C++, and acronyms.",
          },
          pronunciations: {
            type: "array",
            maxItems: 12,
            description:
              'Optional exact token substitutions used only to make TTS pronunciation unambiguous. Include only compact numbers, symbols, versions, or acronyms from written_message, for example {"written":"5.0","spoken":"five point zero"} or {"written":"SS+","spoken":"S S plus"}. Never include ordinary words or phrases. Use [] when no token needs help.',
            items: {
              type: "object",
              properties: {
                written: { type: "string" },
                spoken: { type: "string" },
              },
              required: ["written", "spoken"],
            },
          },
          delivery: {
            type: "string",
            description:
              'How the line is spoken, in a few words (e.g. "flat and cold", "rushed and panicky, rising at the end", "almost a whisper"). This should only be vocal descriptions, not physical.',
          },
          emotion: {
            type: "string",
            enum: [...speechEmotionsForVoice(humanoid.character.voice.routedVoice)],
            description: speechEmotionDescription(
              humanoid.character.voice.routedVoice,
            ),
          },
          hostility: HOSTILITY_FIELD,
          ...speechToolFields(humanoid, world),
        },
        required: [
          "written_message",
          "pronunciations",
          "delivery",
          "emotion",
          "hostility",
          "language",
          "addressing",
        ],
      },
    };
  },
  execute(humanoid, world, input) {
    const written =
      typeof input.written_message === "string"
        ? input.written_message
        : input.message;
    if (typeof written === "string" && written.length > 0) {
      const spoken = spokenMessageFromWritten(written, input.pronunciations);
      const addressing = speechAudienceFor(humanoid, world, input.addressing);
      humanoid.say(
        written,
        spoken,
        world,
        simNow(),
        "say",
        speechLanguageFor(humanoid, world, input.language, addressing),
        addressing,
        typeof input.delivery === "string" ? input.delivery : undefined,
        speechEmotion(input.emotion, humanoid.character.voice.routedVoice),
        typeof input.hostility === "string" ? input.hostility : undefined,
      );
      // logging happens inside say(), with the line the world actually hears
    }
  },
};
