import { destinations, travelTo } from "./shared";
import type { SimTool } from "./types";

export const walkTo: SimTool = {
  name: "walk_to",
  condition: (humanoid, world) =>
    destinations(humanoid, world).length > 0 && humanoid.stamina > 0,
  definition: (humanoid, world) => ({
    name: "walk_to",
    description:
      "Walk to an adjacent room (through its door), or to a humanoid in your room to follow them — you will trail them wherever they go, through doors into other rooms, until you stop, speak, or pick a new destination. To travel somewhere as a group, one person leads the way and the others follow them.",
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
