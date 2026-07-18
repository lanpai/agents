import { destinations, travelTo } from "./shared";
import type { SimTool } from "./types";

export const runTo: SimTool = {
  name: "run_to",
  condition: (humanoid, world) =>
    destinations(humanoid, world).length > 0 && humanoid.stamina > 0,
  definition: (humanoid, world) => ({
    name: "run_to",
    description:
      "Run to an adjacent room (through its door), or to a humanoid in your room to follow them at a run — twice your walking speed, draining stamina twice as fast. A followed humanoid is trailed wherever they go, through doors into other rooms, until you stop, speak, or pick a new destination.",
    input_schema: {
      type: "object",
      properties: {
        destination: {
          type: "string",
          enum: destinations(humanoid, world),
          description: "An adjacent room or a humanoid in your room",
        },
      },
      required: ["destination"],
    },
  }),
  execute(humanoid, world, input) {
    travelTo(humanoid, world, String(input.destination), true);
  },
};
