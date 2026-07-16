import { logAction } from "../log";
import type { SimTool } from "./types";

export const yell: SimTool = {
  name: "yell",
  definition: {
    name: "yell",
    description: "Yell loudly. Heard in your room and all adjacent rooms.",
    input_schema: {
      type: "object",
      properties: {
        message: {
          type: "string",
          description: "What to yell, under 15 words, kept short and natural",
        },
      },
      required: ["message"],
    },
  },
  execute(humanoid, world, input) {
    if (typeof input.message === "string" && input.message.length > 0) {
      humanoid.say(input.message, world, performance.now(), "yell");
      logAction(`${humanoid.name} yells: "${input.message}"`, humanoid);
    }
  },
};
