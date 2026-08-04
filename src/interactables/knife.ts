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
  // a chef's knife is about a foot long — 10 world units — but at that size it
  // is a splinter on the floor and nobody spots it. 18 reads as a knife.
  override onGroundArt = { src: "/knife.png", width: 18 };
  onGroundDescription = (humanoid: Humanoid) =>
    humanoid.statuses.has("Murderous Intent")
      ? "You see a knife that could probably be used to stab someone."
      : "You see a knife that's likely used by the cook staff.";
  inInventoryDescription = "You are carrying a knife.";

  // There is exactly one knife in the building, so whoever holds it decides
  // whether the story can happen at all — a bystander pocketing it on their way
  // through the kitchen leaves the killer with nothing to reach for. Only the
  // person who means to use it can pick it up. Gating on an anger threshold
  // instead was not enough: bystanders sit just under the murderous line while a
  // killer is active, so they cleared the bar too and took the blade with them.
  override canBeTakenBy(humanoid: Humanoid): boolean {
    return humanoid.statuses.has("Murderous Intent");
  }

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
