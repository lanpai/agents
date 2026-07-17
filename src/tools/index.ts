import type Anthropic from "@anthropic-ai/sdk";
import type { Humanoid } from "../humanoid";
import { findPath } from "./find_path";
import { pickUp } from "./pick_up";
import { punch } from "./punch";
import { push } from "./push";
import { runTo } from "./run_to";
import { say } from "./say";
import { standStill } from "./stand_still";
import type { SimTool } from "./types";
import { walkTo } from "./walk_to";
import { wait } from "./wait";
import { yell } from "./yell";
import { roomOf } from "../locations";
import { drop } from "./drop";
import { drink } from "./drink";

export type { SimTool } from "./types";

export const BASIC_SIM_TOOLS: SimTool[] = [
  say,
  yell,
  walkTo,
  runTo,
  findPath,
  pickUp,
  drop,
  push,
  punch,
  standStill,
  wait,
  drink,
];

function getToolsFor(humanoid: Humanoid, world: Humanoid[]) {
  const tools = BASIC_SIM_TOOLS.filter(
    (tool) => tool.condition?.(humanoid, world) ?? true,
  );

  for (const item of humanoid.carrying) {
    tools.push(...item.inInventoryTools(humanoid));
  }

  for (const interactable of roomOf(humanoid.x, humanoid.y).interactables) {
    tools.push(...interactable.onGroundTools(humanoid));
  }

  return tools;
}

// the tool list a humanoid sees: only tools whose condition passes, with
// per-humanoid definitions resolved
export function buildTools(
  humanoid: Humanoid,
  world: Humanoid[],
): Anthropic.Tool[] {
  return getToolsFor(humanoid, world).map((tool) =>
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
  const tool = getToolsFor(humanoid, world).find(
    (candidate) => candidate.name === name,
  );
  if (!tool) return;
  // enforce the visibility condition on execution too
  if (tool.condition && !tool.condition(humanoid, world)) return;
  tool.execute(humanoid, world, input);
}
