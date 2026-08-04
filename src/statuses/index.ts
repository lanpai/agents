import type { Humanoid } from "../humanoid";
import { MurderousIntent } from "./murderousIntent";
import { Status } from "./types";
import { UrgentMeeting } from "./urgentMeeting";

type NonAbstractStatus = Pick<typeof Status, keyof typeof Status> &
  (new (...args: any[]) => Status);

export function addStatusToHumanoid<T extends NonAbstractStatus>(
  humanoid: Humanoid,
  status: T,
): T["prototype"] {
  const newStatus = new status(humanoid);
  humanoid.statuses.set(newStatus.name, newStatus);
  return newStatus;
}

// statuses are class instances, so saves store only the name (plus mutable
// state) and rebuild the instance from this registry on load. Only the
// randomly dealt roles live here — character-innate statuses (maimai, DDR)
// come back through onInit instead.
const STATUS_FACTORIES: Record<string, NonAbstractStatus> = {
  "Murderous Intent": MurderousIntent,
  "Urgent Meeting": UrgentMeeting,
};

export function createStatus(name: string, owner: Humanoid): Status | null {
  const factory = STATUS_FACTORIES[name];
  return factory ? new factory(owner) : null;
}
