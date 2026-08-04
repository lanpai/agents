import type { Humanoid } from "../humanoid";
import { roomOf } from "../locations";
import { logEmote } from "../log";
import { MaimaiPlayer } from "../statuses/maimaiPlayer";
import type { SimTool } from "../tools";
import { approachAndUse } from "../tools/shared";
import { Interactable } from "./types";

export class Maimai extends Interactable {
  name = "maimai";
  override onGroundArt = { src: "/arcade/maimai.png", width: 32 };
  onGroundDescription = "You see a maimai DX cabinet.";

  override distraction = true;

  override onGroundTools(_humanoid: Humanoid): SimTool[] {
    const cabinet = this;
    return [
      {
        name: "play_maimai",
        definition: {
          name: "play_maimai",
          description: "Play a game of maimai on the maimai DX cabinet.",
          input_schema: {
            type: "object",
          },
        },
        execute(humanoid, world) {
          const play = () => {
            const room = roomOf(humanoid.x, humanoid.y);

            // playing satisfies a maimai craving
            const craving = humanoid.statuses.get("Maimai Player");
            if (craving instanceof MaimaiPlayer) {
              craving.timeSinceLastPlayed = 0;
            }

            humanoid.remember(
              "You played a game of maimai on the maimai DX cabinet.",
            );

            for (const witness of world) {
              if (witness === humanoid || witness.dead) continue;
              if (roomOf(witness.x, witness.y) !== room) continue;
              witness.remember(
                `You saw ${humanoid.character.name} play a game of maimai on the maimai DX cabinet.`,
              );
            }

            logEmote(
              `${humanoid.character.name} plays a game of maimai.`,
              humanoid,
            );
          };
          if (!cabinet.position) return play();
          approachAndUse(humanoid, cabinet.position, "maimai DX cabinet", play);
        },
      },
    ];
  }
}
