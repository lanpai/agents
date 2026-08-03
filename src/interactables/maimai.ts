import type { Humanoid } from "../humanoid";
import { roomOf } from "../locations";
import { logEmote } from "../log";
import type { SimTool } from "../tools";
import { Interactable } from "./types";

export class Maimai extends Interactable {
  name = "maimai";
  onGroundDescription = "You see a maimai DX cabinet.";

  override onGroundTools(_humanoid: Humanoid): SimTool[] {
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
          const room = roomOf(humanoid.x, humanoid.y);

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
        },
      },
    ];
  }
}
