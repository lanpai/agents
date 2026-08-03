import type { Humanoid } from "../humanoid";
import { Status } from "./types";

type NonAbstractStatus = Pick<typeof Status, keyof typeof Status> &
  (new (...args: any[]) => Status);

export function addStatusToHumanoid(
  humanoid: Humanoid,
  status: NonAbstractStatus,
) {
  const newStatus = new status(humanoid);
  humanoid.statuses.set(newStatus.name, newStatus);
}

// statuses are class instances, so saves store only the name (plus mutable
// state) and rebuild the instance from this registry on load
const STATUS_FACTORIES: Record<string, NonAbstractStatus> = {};

export function createStatus(name: string, owner: Humanoid): Status | null {
  const factory = STATUS_FACTORIES[name];
  return factory ? new factory(owner) : null;
}
