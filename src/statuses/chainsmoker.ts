import type { Humanoid } from "../humanoid";
import { Status } from "./types";

export class Chainsmoker extends Status {
  name = "Chainsmoker";
  timeSinceLastSmoke = Infinity;

  describeStatus(humanoid: Humanoid, viewer: Humanoid) {
    if (humanoid !== viewer) return null;

    if (this.timeSinceLastSmoke > 8 * 60 * 1000) {
      return "You desperately need to go to the porch to smoke. You are incredibly easy to aggravate right now because of your need to smoke.";
    }

    if (this.timeSinceLastSmoke > 6 * 60 * 1000) {
      return "You need to go to the porch to smoke. You are irritable right now because of your need to smoke.";
    }

    if (this.timeSinceLastSmoke > 3 * 60 * 1000) {
      return "You feel a slight tingling to go to the porch to smoke. You are a little irritable right now because of your need to smoke.";
    }

    if (this.timeSinceLastSmoke < 1 * 60 * 1000) {
      return "You have recently had a smoke at the porch. You feel great and are at your peak mental performance.";
    }

    return null;
  }

  override update(dt: number) {
    this.timeSinceLastSmoke += dt;
  }
}
