import { HOSTILITY_LEVELS } from "../anger";
import { simNow } from "../time";
import { roommateNames } from "./shared";
import type { SimTool } from "./types";

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
          message: {
            type: "string",
            description: "What to say, under 15 words, kept short and natural",
          },
          delivery: {
            type: "string",
            description:
              'How the line is spoken, in a few words (e.g. "flat and cold", "rushed and panicky, rising at the end", "almost a whisper"). This should only be vocal descriptions, not physical.',
          },
          hostility: HOSTILITY_FIELD,
        },
        required: ["message", "delivery", "hostility"],
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
        typeof input.hostility === "string" ? input.hostility : undefined,
      );
      // logging happens inside say(), with the line the world actually hears
    }
  },
};
