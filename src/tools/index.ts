import type Anthropic from "@anthropic-ai/sdk";
import type { Humanoid } from "../humanoid";
import { findPath } from "./find_path";
import { pickUp } from "./pick_up";
import { punch } from "./punch";
import { push } from "./push";
import { runTo } from "./run_to";
import { say } from "./say";
import { stab } from "./stab";
import { standStill } from "./stand_still";
import type { SimTool } from "./types";
import { walkTo } from "./walk_to";
import { wait } from "./wait";
import { yell } from "./yell";

export type { SimTool } from "./types";

export const SIM_TOOLS: SimTool[] = [
  say,
  yell,
  walkTo,
  runTo,
  findPath,
  pickUp,
  push,
  punch,
  stab,
  standStill,
  wait,
];

// the tool list a humanoid sees: only tools whose condition passes, with
// per-humanoid definitions resolved
export function buildTools(
  humanoid: Humanoid,
  world: Humanoid[],
): Anthropic.Tool[] {
  return SIM_TOOLS.filter(
    (tool) => tool.condition?.(humanoid, world) ?? true,
  ).map((tool) =>
    typeof tool.definition === "function"
      ? tool.definition(humanoid, world)
      : tool.definition,
  );
}

export function executeTool(
  name: string,
  humanoid: Humanoid,
  world: Humanoid[],
  input: Record<string, unknown>,
) {
  const tool = SIM_TOOLS.find((candidate) => candidate.name === name);
  if (!tool) return;
  // enforce the visibility condition on execution too
  if (tool.condition && !tool.condition(humanoid, world)) return;
  tool.execute(humanoid, world, input);
}
