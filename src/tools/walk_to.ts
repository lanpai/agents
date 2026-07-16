import { destinations, travelTo } from "./shared";
import type { SimTool } from "./types";

export const walkTo: SimTool = {
  name: "walk_to",
  condition: (humanoid, world) => destinations(humanoid, world).length > 0,
  definition: (humanoid, world) => ({
    name: "walk_to",
    description:
      "Walk to an adjacent room (through its door) or toward a humanoid in your room, following them until you decide otherwise.",
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
    travelTo(humanoid, world, String(input.destination), false);
  },
};
