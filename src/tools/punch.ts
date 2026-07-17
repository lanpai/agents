import { BODY_PARTS, formatFeet, PUNCH_DAMAGE, TOUCH_RANGE } from "../humanoid";
import { strike } from "./shared";
import type { SimTool } from "./types";

export const punch: SimTool = {
  name: "punch",
  definition: {
    name: "punch",
    description: `Punch a humanoid within arm's reach (${formatFeet(TOUCH_RANGE)}), dealing ${PUNCH_DAMAGE}% damage to the chosen body part.`,
    input_schema: {
      type: "object",
      properties: {
        target: { type: "string", description: "Name of the humanoid to punch" },
        body_part: { type: "string", enum: [...BODY_PARTS] },
      },
      required: ["target", "body_part"],
    },
  },
  execute(humanoid, world, input) {
    strike(humanoid, world, input, PUNCH_DAMAGE, {
      present: "punches",
      past: "punched",
    });
  },
};
