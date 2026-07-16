import { logAction } from "../log";
import type { SimTool } from "./types";

export const say: SimTool = {
  name: "say",
  definition: {
    name: "say",
    description:
      "Speak at conversational volume. Everyone in your room hears you.",
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
  },
  execute(humanoid, world, input) {
    if (typeof input.message === "string" && input.message.length > 0) {
      humanoid.say(input.message, world, performance.now(), "say");
      logAction(`${humanoid.name} says: "${input.message}"`, humanoid);
    }
  },
};
