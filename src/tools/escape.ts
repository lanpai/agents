import { getEscapeRoute, escapeRouteUseLabel } from "../escapeRoute";
import type { Humanoid } from "../humanoid";
import { roomOf } from "../locations";
import { approachAndUse } from "./shared";
import type { SimTool } from "./types";

function availableEscape(humanoid: Humanoid) {
  const route = getEscapeRoute();
  return route &&
    !humanoid.dead &&
    !humanoid.escaped &&
    roomOf(humanoid.x, humanoid.y).name === route.roomName
    ? route
    : null;
}

export const escape: SimTool = {
  name: "escape",
  condition: (humanoid) => availableEscape(humanoid) !== null,
  definition: (humanoid) => {
    const route = availableEscape(humanoid)!;
    const label = escapeRouteUseLabel(route);
    return {
      name: "escape",
      description: `Leave the building through the glowing green ${label}. You permanently exit the story and will no longer see, hear, speak, move, or respond to events.`,
      input_schema: { type: "object" },
    };
  },
  execute(humanoid, world) {
    const route = availableEscape(humanoid);
    if (!route) return;
    const label = escapeRouteUseLabel(route);
    approachAndUse(humanoid, route, label, () => {
      if (availableEscape(humanoid)) humanoid.escape(world, label);
    });
  },
};
