import { simNow } from "../time";
import {
  speechEmotion,
  speechEmotionDescription,
  speechEmotionsForVoice,
} from "../speechEmotion";
import { roommateNames } from "./shared";
import type { SimTool } from "./types";

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
          message: {
            type: "string",
            description: "What to say, under 15 words, kept short and natural",
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
        "say",
        typeof input.delivery === "string" ? input.delivery : undefined,
        speechEmotion(input.emotion, humanoid.character.voice.routedVoice),
      );
      // logging happens inside say(), with the line the world actually hears
    }
  },
};
