import type Anthropic from "@anthropic-ai/sdk";
import { isKiller } from "../anger";
import type { Humanoid } from "../humanoid";
import { findPath } from "./find_path";
import { pickUp } from "./pick_up";
import { runTo } from "./run_to";
import { say } from "./say";
import { standStill } from "./stand_still";
import type { SimTool } from "./types";
import { walkTo } from "./walk_to";
import { wait } from "./wait";
import { yell } from "./yell";
import { ROOMS, roomOf } from "../locations";
import { Item } from "../interactables/types";
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
  standStill,
  wait,
  drink,
];

function getToolsFor(humanoid: Humanoid, world: Humanoid[]) {
  // an unarmed killer is walking to the kitchen and nothing else. Speaking
  // roots you to the spot (say/yell both call standStill), so leaving those
  // tools in place lets the model cancel its own walk every turn — the killer
  // never clears the doorway. They get their voice back once armed.
  // ...but only while the sim is actually walking them somewhere. If the knife
  // is in nobody's reach on a floor — carried off, or gone — fetchTheKnife has
  // nothing to aim at, and stripping their legs as well would leave them
  // standing exactly where they were with no way to move at all.
  const knifeOnFloor = ROOMS.some((room) =>
    room.interactables.some(
      (thing) => thing instanceof Item && thing.name === "Knife",
    ),
  );
  const marching =
    isKiller(humanoid) &&
    knifeOnFloor &&
    !humanoid.carrying.some((item) => item.name === "Knife");
  // walking is taken off them for the same reason: a decision lands every few
  // seconds, and any one of them redirecting the march means the kitchen is
  // never reached. The walk is the sim's job now — theirs is what to do on
  // arrival.
  const MARCHING_BLOCKS = new Set(["say", "yell", "walk_to", "run_to"]);
  const tools = BASIC_SIM_TOOLS.filter(
    (tool) =>
      !(marching && MARCHING_BLOCKS.has(tool.name)) &&
      (tool.condition?.(humanoid, world) ?? true),
  );

  for (const item of humanoid.carrying) {
    tools.push(...item.inInventoryTools(humanoid));
  }

  const hunting = isKiller(humanoid);
  for (const interactable of roomOf(humanoid.x, humanoid.y).interactables) {
    if (hunting && interactable.distraction) continue;
    tools.push(...interactable.onGroundTools(humanoid));
  }

  // duplicate items (say, two packs of cigarettes) each offer their tool, and
  // the API rejects two tools with the same name — keep the first of each,
  // which is also the one executeTool's find() would run
  const seen = new Set<string>();
  return tools.filter((tool) => {
    if (seen.has(tool.name)) return false;
    seen.add(tool.name);
    return true;
  });
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
