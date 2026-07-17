import { broadcastToRoom, type Humanoid } from "../humanoid";
import { roomOf } from "../locations";
import { logAction } from "../log";
import { Chainsmoker } from "../statuses/chainsmoker";
import type { SimTool } from "../tools";
import { Item } from "./types";

export class PackOfCigarettes extends Item {
  name = "Pack of Cigarettes";

  onGroundDescription = "You see a pack of cigarettes.";
  inInventoryDescription = "You are carrying a pack of cigarettes.";

  override inInventoryTools(humanoid: Humanoid): SimTool[] {
    const room = roomOf(humanoid.x, humanoid.y);

    return [
      {
        name: "smoke",
        definition: {
          name: "smoke",
          description:
            room.name === "Porch"
              ? "Smoke a cigarette indoors."
              : "Smoke a cigarette.",
          input_schema: { type: "object", properties: {}, required: [] },
        },
        execute(humanoid, world) {
          const chainsmokerStatus = humanoid.statuses.get("Chainsmoker");
          if (chainsmokerStatus instanceof Chainsmoker) {
            chainsmokerStatus.timeSinceLastSmoke = 0;
          }

          const room = roomOf(humanoid.x, humanoid.y);
          const suffix = room.name === "Porch" ? "" : " indoors";

          humanoid.remember(`You smoked a cigarette ${suffix}.`);
          broadcastToRoom(
            humanoid,
            world,
            `You saw ${humanoid.character.name} smoke a cigarette${suffix}.`,
          );
          logAction(
            `${humanoid.character.name} smokes a cigarette ${suffix}.`,
            humanoid,
          );
        },
      },
    ];
  }
}
