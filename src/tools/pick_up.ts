import { itemsOnFloorIn } from "../items";
import { roomOf } from "../locations";
import { logAction } from "../log";
import type { SimTool } from "./types";

export const pickUp: SimTool = {
  name: "pick_up",
  // only offered while something is actually lying in the room
  condition: (humanoid) =>
    itemsOnFloorIn(roomOf(humanoid.x, humanoid.y)).length > 0,
  definition: (humanoid) => {
    const items = itemsOnFloorIn(roomOf(humanoid.x, humanoid.y));
    return {
      name: "pick_up",
      description: "Pick up an item lying in your room and carry it with you.",
      input_schema: {
        type: "object",
        properties: {
          item: {
            type: "string",
            enum: items.map((item) => item.name),
            description: "An item lying in your room",
          },
        },
        required: ["item"],
      },
    };
  },
  execute(humanoid, world, input) {
    const room = roomOf(humanoid.x, humanoid.y);
    const item = itemsOnFloorIn(room).find(
      (candidate) => candidate.name === input.item,
    );
    if (!item) {
      humanoid.remember(`You looked for the ${input.item}, but it isn't here.`);
      return;
    }
    item.holder = humanoid;
    item.droppedPosition = null;
    humanoid.remember(`You picked up the ${item.name}.`);
    for (const witness of world) {
      if (witness === humanoid || witness.dead) continue;
      if (roomOf(witness.x, witness.y) !== room) continue;
      witness.remember(`You saw ${humanoid.name} pick up the ${item.name}.`);
    }
    logAction(`${humanoid.name} picks up the ${item.name}`, humanoid);
  },
};
