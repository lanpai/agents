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

export const yell: SimTool = {
  name: "yell",
  definition: (humanoid, world) => {
    const listeners = roommateNames(humanoid, world);
    return {
      name: "yell",
      description:
        (listeners.length > 0
          ? `Yell loudly. Heard by ${listeners.join(", ")}, and by anyone in adjacent rooms.`
          : "Yell loudly. No one else is in your room, but anyone in adjacent rooms will hear it.") +
        " Yelling makes you stop moving.",
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
              'How the line is yelled, in a few words (e.g. "furious, spitting every word", "booming and jovial", "cracking with panic"). This should only be vocal descriptions, not physical.',
          },
          emotion: {
            type: "string",
            enum: [...speechEmotionsForVoice(humanoid.character.voice.routedVoice)],
            description: speechEmotionDescription(
              humanoid.character.voice.routedVoice,
            ),
          },
          ...speechToolFields(humanoid, world, true),
        },
        required: [
          "written_message",
          "pronunciations",
          "delivery",
          "emotion",
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
        "yell",
        speechLanguageFor(humanoid, world, input.language, addressing, true),
        addressing,
        typeof input.delivery === "string" ? input.delivery : undefined,
        speechEmotion(input.emotion, humanoid.character.voice.routedVoice),
      );
      // logging happens inside say(), with the line the world actually hears
    }
  },
};
