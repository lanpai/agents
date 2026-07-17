import { itemsHeldBy } from "../interactables";
import { Drinkable } from "../interactables/types";
import type { SimTool } from "./types";

export const drink: SimTool = {
  name: "drink",
  condition: (humanoid) =>
    itemsHeldBy(humanoid).some((item) => item instanceof Drinkable),
  definition: (humanoid) => ({
    name: "drink",
    description: "Drink something you are carrying.",
    input_schema: {
      type: "object",
      properties: {
        target: {
          type: "string",
          enum: itemsHeldBy(humanoid)
            .filter((item) => item instanceof Drinkable)
            .map((item) => item.name),
        },
      },
      required: ["target", "body_part"],
    },
  }),
  execute(humanoid, _world, input) {
    for (const item of itemsHeldBy(humanoid)) {
      if (!(item instanceof Drinkable)) continue;
      if (String(input.target) !== item.name) continue;

      item.onDrink(humanoid);
    }
  },
};
