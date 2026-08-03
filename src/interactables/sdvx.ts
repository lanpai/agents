import type { Humanoid } from "../humanoid";
import { roomOf } from "../locations";
import { logEmote } from "../log";
import type { SimTool } from "../tools";
import { Interactable } from "./types";

export class SDVX extends Interactable {
  name = "SDVX";
  onGroundDescription = "You see a Sound Voltex cabinet.";

  override onGroundTools(_humanoid: Humanoid): SimTool[] {
    return [
      {
        name: "play_sdvx",
        definition: {
          name: "play_sdvx",
          description: "Play a game of SDVX on the Sound Voltex cabinet.",
          input_schema: {
            type: "object",
          },
        },
        execute(humanoid, world) {
          const room = roomOf(humanoid.x, humanoid.y);

          humanoid.remember(
            "You played a game of SDVX on the Sound Voltex cabinet.",
          );

          for (const witness of world) {
            if (witness === humanoid || witness.dead) continue;
            if (roomOf(witness.x, witness.y) !== room) continue;
            witness.remember(
              `You saw ${humanoid.character.name} play a game of SDVX on the Sound Voltex cabinet.`,
            );
          }

          logEmote(
            `${humanoid.character.name} plays a game of SDVX.`,
            humanoid,
          );
        },
      },
    ];
  }
}
