import { simNow } from "../time";
import { logAction } from "../log";
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
        },
        required: ["message"],
      },
    };
  },
  execute(humanoid, world, input) {
    if (typeof input.message === "string" && input.message.length > 0) {
      humanoid.say(input.message, world, simNow(), "say");
      logAction(`${humanoid.character.name} says: "${input.message}"`, humanoid);
    }
  },
};
