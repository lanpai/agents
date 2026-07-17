import type { Humanoid } from "../humanoid";
import { Status } from "./types";

export function addStatusToHumanoid(humanoid: Humanoid, status: typeof Status) {
  const newStatus = new status(humanoid);
  humanoid.statuses.set(newStatus.name, newStatus);
}
