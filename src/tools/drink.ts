import { broadcastToRoom } from "../humanoid";
import { Drinkable } from "../interactables/types";
import { logEmote } from "../log";
import type { SimTool } from "./types";

export const drink: SimTool = {
  name: "drink",
  condition: (humanoid) =>
    humanoid.carrying.some((item) => item instanceof Drinkable),
  definition: (humanoid) => ({
    name: "drink",
    description: "Drink something you are carrying. It is used up.",
    input_schema: {
      type: "object",
      properties: {
        target: {
          type: "string",
          enum: humanoid.carrying
            .filter((item) => item instanceof Drinkable)
            .map((item) => item.name),
        },
      },
      required: ["target"],
    },
  }),
  execute(humanoid, world, input) {
    const item = humanoid.carrying.find(
      (candidate) =>
        candidate instanceof Drinkable && candidate.name === input.target,
    );
    if (!(item instanceof Drinkable)) {
      humanoid.remember(`You have no ${input.target} to drink.`);
      return;
    }
    item.onDrink(humanoid);
    // drinking uses the item up
    humanoid.carrying.splice(humanoid.carrying.indexOf(item), 1);
    humanoid.remember(`You drank the ${item.name}.`);
    broadcastToRoom(
      humanoid,
      world,
      `You saw ${humanoid.character.name} drink the ${item.name}.`,
    );
    logEmote(`${humanoid.character.name} drinks the ${item.name}`, humanoid);
  },
};
