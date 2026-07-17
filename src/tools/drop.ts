import { roomOf } from "../locations";
import { logEmote } from "../log";
import type { SimTool } from "./types";

export const drop: SimTool = {
  name: "drop",
  // only offered while something is actually lying in the room
  condition: (humanoid) => humanoid.carrying.length > 0,
  definition: (humanoid) => {
    return {
      name: "drop",
      description:
        "Place down an item you are carrying on you. This can be used to give people things you are carrying.",
      input_schema: {
        type: "object",
        properties: {
          item: {
            type: "string",
            enum: humanoid.carrying.map((item) => item.name),
            description: "An item you want to place down",
          },
        },
        required: ["item"],
      },
    };
  },
  execute(humanoid, world, input) {
    const room = roomOf(humanoid.x, humanoid.y);
    const item = humanoid.carrying.find(
      (candidate) => candidate.name === input.item,
    );
    if (!item) {
      humanoid.remember(`You looked for the ${input.item}, but it isn't here.`);
      return;
    }
    room.interactables.push(item);
    item.position = { x: humanoid.x, y: humanoid.y };
    humanoid.carrying.splice(humanoid.carrying.indexOf(item), 1);
    humanoid.remember(`You placed down the ${item.name}.`);
    for (const witness of world) {
      if (witness === humanoid || witness.dead) continue;
      if (roomOf(witness.x, witness.y) !== room) continue;
      witness.remember(
        `You saw ${humanoid.character.name} place down the ${item.name}.`,
      );
    }
    logEmote(
      `${humanoid.character.name} places down the ${item.name}.`,
      humanoid,
    );
  },
};
