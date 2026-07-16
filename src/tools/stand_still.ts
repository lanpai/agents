import { logAction } from "../log";
import type { SimTool } from "./types";

export const standStill: SimTool = {
  name: "stand_still",
  condition: (humanoid) => humanoid.isMoving() || humanoid.followName !== null,
  definition: {
    name: "stand_still",
    description: "Stop moving and stand in place.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  execute(humanoid) {
    humanoid.standStill();
    logAction(`${humanoid.character.name} stops`, humanoid);
  },
};
