import { logQuietAction } from "../log";
import type { SimTool } from "./types";

export const wait: SimTool = {
  name: "wait",
  definition: {
    name: "wait",
    description:
      "Do nothing this turn and continue whatever you were already doing.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  execute(humanoid) {
    logQuietAction(`${humanoid.character.name} waits`, humanoid);
  },
};
