import { simNow } from "../time";
import {
  findPath as findRoomPath,
  ROOMS,
  roomByName,
  roomOf,
} from "../locations";
import type { SimTool } from "./types";

export const findPath: SimTool = {
  name: "find_path",
  condition: () => ROOMS.length > 1,
  definition: (humanoid) => {
    const current = roomOf(humanoid.x, humanoid.y);
    return {
      name: "find_path",
      description:
        "Look up which rooms to walk through to reach any room in the house.",
      input_schema: {
        type: "object",
        properties: {
          room: {
            type: "string",
            enum: ROOMS.map((room) => room.name).filter(
              (name) => name !== current.name,
            ),
            description: "The destination room",
          },
        },
        required: ["room"],
      },
    };
  },
  execute(humanoid, _world, input) {
    const current = roomOf(humanoid.x, humanoid.y);
    const destination = roomByName(String(input.room));
    if (!destination) {
      humanoid.remember(`There is no room called ${input.room}.`);
      return;
    }
    if (destination === current) {
      humanoid.remember(`You are already in ${current.promptName}.`);
      return;
    }
    const path = findRoomPath(current, destination);
    if (!path) {
      humanoid.remember(
        `There is no way to reach ${destination.promptName} from ${current.promptName}.`,
      );
      return;
    }
    humanoid.remember(
      `Route from ${current.promptName} to ${destination.promptName}: ${path
        .slice(1)
        .map((name) => roomByName(name)?.promptName ?? name)
        .join(", then ")}.`,
    );
    // routes are asked for in order to be used — think again right away
    humanoid.nextThinkAt = Math.min(humanoid.nextThinkAt, simNow() + 1000);
  },
};
