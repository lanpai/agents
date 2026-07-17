import type { Humanoid } from "../humanoid";
import { roomOf } from "../locations";
import { logEmote } from "../log";
import type { SimTool } from "../tools";
import { Interactable } from "./types";
import { Wine } from "./wine";

export class WineRack extends Interactable {
  name = "Wine Rack";
  onGroundDescription =
    "You see a wine rack filled to the brim with all sorts of wines from around the world.";

  override onGroundTools(_humanoid: Humanoid): SimTool[] {
    return [
      {
        name: "grab_from_wine_rack",
        definition: {
          name: "grab_from_wine_rack",
          description: "Grab a bottle of wine from the wine rack.",
          input_schema: {
            type: "object",
            required: ["target", "body_part"],
          },
        },
        execute(humanoid, world) {
          const room = roomOf(humanoid.x, humanoid.y);

          humanoid.carrying.push(new Wine());

          humanoid.remember(
            "You picked up the a bottle of wine from the wine rack.",
          );

          for (const witness of world) {
            if (witness === humanoid || witness.dead) continue;
            if (roomOf(witness.x, witness.y) !== room) continue;
            witness.remember(
              `You saw ${humanoid.character.name} grab a bottle of wine from the wine rack.`,
            );
          }

          logEmote(
            `${humanoid.character.name} grabs a bottle of wine from the wine rack`,
            humanoid,
          );
        },
      },
    ];
  }
}
