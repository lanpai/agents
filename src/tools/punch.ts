import { BODY_PARTS, formatFeet, PUNCH_DAMAGE, TOUCH_RANGE } from "../humanoid";
import { strike } from "./shared";
import type { SimTool } from "./types";

export const punch: SimTool = {
  name: "punch",
  definition: {
    name: "punch",
    description: `Punch a humanoid in your room, dealing ${PUNCH_DAMAGE}% damage to the chosen body part. If they're beyond arm's reach (${formatFeet(TOUCH_RANGE)}) you walk up to them first, and the blow lands when you reach them.`,
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
