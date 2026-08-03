import type { Humanoid } from "../humanoid";
import { roomOf } from "../locations";
import { logEmote } from "../log";
import type { SimTool } from "../tools";
import { Interactable } from "./types";

export class DDR extends Interactable {
  name = "DDR";
  onGroundDescription = "You see a Dance Dance Revolution cabinet.";

  override onGroundTools(_humanoid: Humanoid): SimTool[] {
    return [
      {
        name: "play_ddr",
        definition: {
          name: "play_ddr",
          description:
            "Play a game of DDR on the Dance Dance Revolution cabinet.",
          input_schema: {
            type: "object",
          },
        },
        execute(humanoid, world) {
          const room = roomOf(humanoid.x, humanoid.y);

          humanoid.remember(
            "You played a game of DDR on the Dance Dance Revolution cabinet.",
          );

          for (const witness of world) {
            if (witness === humanoid || witness.dead) continue;
            if (roomOf(witness.x, witness.y) !== room) continue;
            witness.remember(
              `You saw ${humanoid.character.name} play a game of DDR on the Dance Dance Revolution cabinet.`,
            );
          }

          logEmote(`${humanoid.character.name} plays a game of DDR.`, humanoid);
        },
      },
    ];
  }
}
