import {
  BODY_PARTS,
  formatFeet,
  STAB_DAMAGE,
  TOUCH_RANGE,
  type Humanoid,
} from "../humanoid";
import type { SimTool } from "../tools";
import { strike } from "../tools/shared";
import { Item } from "./types";

export class Knife extends Item {
  name = "Knife";
  onGroundDescription = "You see a knife that's likely used by the cook staff.";
  inInventoryDescription = "You are carrying a knife.";

  override inInventoryTools(_humanoid: Humanoid): SimTool[] {
    return [
      {
        name: "stab",
        definition: {
          name: "stab",
          description: `Stab a humanoid in your room with your knife, dealing ${STAB_DAMAGE}% damage to the chosen body part. If they're beyond arm's reach (${formatFeet(TOUCH_RANGE)}) you walk up to them first, and the blow lands when you reach them.`,
          input_schema: {
            type: "object",
            properties: {
              target: {
                type: "string",
                description: "Name of the humanoid to stab",
              },
              body_part: { type: "string", enum: [...BODY_PARTS] },
            },
            required: ["target", "body_part"],
          },
        },
        execute(humanoid, world, input) {
          strike(humanoid, world, input, STAB_DAMAGE, {
            present: "stabs",
            past: "stabbed",
          });
        },
      },
    ];
  }
}
