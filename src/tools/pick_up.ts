import type { Humanoid } from "../humanoid";
import { itemsIn } from "../interactables";
import { roomOf } from "../locations";
import { logEmote } from "../log";
import { approachAndUse } from "./shared";
import type { SimTool } from "./types";

// what this person could actually walk off with — an item may refuse them
// (see Item.canBeTakenBy) while still lying there in plain sight
function takeableBy(humanoid: Humanoid) {
  return itemsIn(roomOf(humanoid.x, humanoid.y)).filter((item) =>
    item.canBeTakenBy(humanoid),
  );
}

export const pickUp: SimTool = {
  name: "pick_up",
  // only offered while something is actually lying in the room
  condition: (humanoid) => takeableBy(humanoid).length > 0,
  definition: (humanoid) => {
    const items = takeableBy(humanoid);
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
    // the grab happens on arrival, re-finding the item in case someone else
    // took it during the walk over
    const grab = () => {
      const room = roomOf(humanoid.x, humanoid.y);
      const item = itemsIn(room).find(
        (candidate) =>
          candidate.name === input.item && candidate.canBeTakenBy(humanoid),
      );
      if (!item) {
        humanoid.remember(
          `You looked for the ${input.item}, but it isn't here.`,
        );
        return;
      }
      room.interactables.splice(room.interactables.indexOf(item), 1);
      item.position = null;
      humanoid.carrying.push(item);
      humanoid.remember(`You picked up the ${item.name}.`);
      for (const witness of world) {
        if (witness === humanoid || witness.dead) continue;
        if (roomOf(witness.x, witness.y) !== room) continue;
        witness.remember(
          `You saw ${humanoid.character.name} pick up the ${item.name}.`,
        );
      }
      logEmote(
        `${humanoid.character.name} picks up the ${item.name}.`,
        humanoid,
      );
    };
    const item = takeableBy(humanoid).find(
      (candidate) => candidate.name === input.item,
    );
    if (!item) {
      humanoid.remember(`You looked for the ${input.item}, but it isn't here.`);
      return;
    }
    if (!item.position) return grab();
    approachAndUse(humanoid, item.position, item.name, grab);
  },
};
