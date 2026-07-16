import { simNow } from "../time";
import { PUSH_DISTANCE, TOUCH_RANGE } from "../humanoid";
import { logAction } from "../log";
import { reachableTarget } from "./shared";
import type { SimTool } from "./types";

const DIRECTION_VECTORS: Record<string, [number, number]> = {
  N: [0, -1],
  NE: [Math.SQRT1_2, -Math.SQRT1_2],
  E: [1, 0],
  SE: [Math.SQRT1_2, Math.SQRT1_2],
  S: [0, 1],
  SW: [-Math.SQRT1_2, Math.SQRT1_2],
  W: [-1, 0],
  NW: [-Math.SQRT1_2, -Math.SQRT1_2],
};

const DIRECTION_WORDS: Record<string, string> = {
  N: "north",
  NE: "northeast",
  E: "east",
  SE: "southeast",
  S: "south",
  SW: "southwest",
  W: "west",
  NW: "northwest",
};

export const push: SimTool = {
  name: "push",
  definition: {
    name: "push",
    description: `Shove a humanoid within arm's reach (${TOUCH_RANGE} units) in a compass direction. Moves them ${PUSH_DISTANCE} units; does not hurt the target.`,
    input_schema: {
      type: "object",
      properties: {
        target: { type: "string", description: "Name of the humanoid to push" },
        direction: {
          type: "string",
          enum: ["N", "NE", "E", "SE", "S", "SW", "W", "NW"],
        },
      },
      required: ["target", "direction"],
    },
  },
  execute(humanoid, world, input) {
    const result = reachableTarget(humanoid, world, input.target);
    const direction = DIRECTION_VECTORS[String(input.direction).toUpperCase()];
    if ("reason" in result) {
      humanoid.remember(
        `You tried to push ${input.target}, but ${result.reason}.`,
      );
      logAction(
        `${humanoid.character.name} tries to push ${input.target} (${result.reason})`,
        humanoid,
      );
      return;
    }
    if (!direction) return;
    const word = DIRECTION_WORDS[String(input.direction).toUpperCase()]!;
    result.target.x += direction[0] * PUSH_DISTANCE;
    result.target.y += direction[1] * PUSH_DISTANCE;
    humanoid.remember(`You pushed ${result.target.character.name} ${word}.`);
    result.target.remember(`${humanoid.character.name} pushed you ${word}!`);
    result.target.nextThinkAt = Math.min(
      result.target.nextThinkAt,
      simNow() + 500,
    );
    logAction(
      `${humanoid.character.name} pushes ${result.target.character.name} ${word}`,
      humanoid,
      result.target,
    );
  },
};
