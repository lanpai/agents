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
  // find_path and stand_still go too, for the same reason as the walk tools.
  // find_path is the only movement-shaped tool left once walking is gone, so a
  // killer under orders to reach the kitchen calls it every turn — and it pulls
  // their next decision in to one second, which keeps them thinking almost
  // continuously and starves the sim's own walk of the idle moment it needs.
  // stand_still simply cancels the march (and any queued pick-up with it).
  const MARCHING_BLOCKS = new Set([
    "say",
    "yell",
    "walk_to",
    "run_to",
    "find_path",
    "stand_still",
  ]);
  // the blade never leaves a killer's hand by their own choice. Only the sim
  // puts it down — when they lose their nerve, or when they die. Left in
  // reach, the model does drop it (hiding the evidence, handing it over,
  // acting normal after a kill), and every one of those ends the run: they
  // stand there disarmed while the sim walks them back for it, and a killer
  // who has already killed can never be replaced.
  const disarmable =
    !isKiller(humanoid) ||
    !humanoid.carrying.some((item) => item.name === "Knife");
  const tools = BASIC_SIM_TOOLS.filter(
    (tool) =>
      !(marching && MARCHING_BLOCKS.has(tool.name)) &&
      !(tool.name === "drop" && !disarmable) &&
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
