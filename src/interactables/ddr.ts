import type { Humanoid } from "../humanoid";
import { roomOf } from "../locations";
import { logEmote } from "../log";
import { DDRPlayer } from "../statuses/ddrPlayer";
import type { SimTool } from "../tools";
import { approachAndUse } from "../tools/shared";
import { Interactable } from "./types";

export class DDR extends Interactable {
  name = "DDR";
  override onGroundArt = { src: "/arcade/ddr.png", width: 24 };
  onGroundDescription = "You see a Dance Dance Revolution cabinet.";

  override distraction = true;

  override onGroundTools(_humanoid: Humanoid): SimTool[] {
    const cabinet = this;
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
          const play = () => {
            const room = roomOf(humanoid.x, humanoid.y);

            // playing satisfies a DDR craving
            const craving = humanoid.statuses.get("DDR Player");
            if (craving instanceof DDRPlayer) {
              craving.timeSinceLastPlayed = 0;
            }

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

            logEmote(
              `${humanoid.character.name} plays a game of DDR.`,
              humanoid,
            );
          };
          if (!cabinet.position) return play();
          approachAndUse(
            humanoid,
            cabinet.position,
            "Dance Dance Revolution cabinet",
            play,
          );
        },
      },
    ];
  }
}
