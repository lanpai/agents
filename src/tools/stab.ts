import { BODY_PARTS, STAB_DAMAGE, TOUCH_RANGE } from "../humanoid";
import { itemsHeldBy } from "../items";
import { strike } from "./shared";
import type { SimTool } from "./types";

export const stab: SimTool = {
  name: "stab",
  // only knife carriers see or can call this tool
  condition: (humanoid) =>
    itemsHeldBy(humanoid).some((item) => item.name === "Knife"),
  definition: {
    name: "stab",
    description: `Stab a humanoid within arm's reach (${TOUCH_RANGE} units) with your knife, dealing ${STAB_DAMAGE}% damage to the chosen body part.`,
    input_schema: {
      type: "object",
      properties: {
        target: { type: "string", description: "Name of the humanoid to stab" },
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
};
