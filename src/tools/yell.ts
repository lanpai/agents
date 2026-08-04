import { simNow } from "../time";
import {
  speechEmotion,
  speechEmotionDescription,
  speechEmotionsForVoice,
} from "../speechEmotion";
import { roommateNames } from "./shared";
import type { SimTool } from "./types";

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
          message: {
            type: "string",
            description: "What to yell, under 15 words, kept short and natural",
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
        },
        required: ["message", "delivery", "emotion"],
      },
    };
  },
  execute(humanoid, world, input) {
    if (typeof input.message === "string" && input.message.length > 0) {
      humanoid.say(
        input.message,
        world,
        simNow(),
        "yell",
        typeof input.delivery === "string" ? input.delivery : undefined,
        speechEmotion(input.emotion, humanoid.character.voice.routedVoice),
      );
      // logging happens inside say(), with the line the world actually hears
    }
  },
};
