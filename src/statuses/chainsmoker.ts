import type { Humanoid } from "../humanoid";
import { PackOfCigarettes } from "../interactables/packOfCigarettes";
import { Status } from "./types";

export class Chainsmoker extends Status {
  name = "Chainsmoker";
  timeSinceLastSmoke = Infinity;

  describeStatus(humanoid: Humanoid, viewer: Humanoid) {
    if (humanoid !== viewer) return null;

    const hasCigarette = humanoid.carrying.some(
      (item) => item instanceof PackOfCigarettes,
    );

    if (this.timeSinceLastSmoke > 6 * 60 * 1000) {
      if (!hasCigarette)
        return "You desperately need to smoke but you do not have any cigarettes. You are in agony and incredibly easy to aggravate right now because of your need to smoke.";
      return "You desperately need to go to the porch to smoke. You are in agony and incredibly easy to aggravate right now because of your need to smoke.";
    }

    if (this.timeSinceLastSmoke > 3 * 60 * 1000) {
      if (!hasCigarette)
        return "You need to smoke but you do not have any cigarettes. You are irritable right now because of your need to smoke.";
      return "You need to go to the porch to smoke. You are irritable right now because of your need to smoke.";
    }

    if (this.timeSinceLastSmoke > 1 * 60 * 1000) {
      if (!hasCigarette)
        return "You you feel a slight tingling to smoke but you do not have any cigarettes. You are a little irritable right now because of your need to smoke.";
      return "You feel a slight tingling to go to the porch to smoke. You are a little irritable right now because of your need to smoke.";
    }

    if (this.timeSinceLastSmoke < 0.5 * 60 * 1000) {
      return "You have recently had a smoke at the porch. You feel great and are at your peak mental performance.";
    }

    if (!hasCigarette)
      return "You have a smoking addiction but do not have a cigarette to smoke later.";

    return null;
  }

  override update(dt: number) {
    this.timeSinceLastSmoke += dt;
  }
}
