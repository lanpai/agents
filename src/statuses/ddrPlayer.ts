import type { Humanoid } from "../humanoid";
import { Status } from "./types";

const MINUTE = 60 * 1000;

export class DDRPlayer extends Status {
  name = "DDR Player";
  timeSinceLastPlayed = Infinity;

  describeStatus(humanoid: Humanoid, viewer: Humanoid) {
    if (humanoid !== viewer) return null;

    if (this.timeSinceLastPlayed > 3 * MINUTE) {
      return "You need to go play DDR on the Dance Dance Revolution cabinet in the arcade room right now. You are irritable right now because of your need to play.";
    }

    if (this.timeSinceLastPlayed > 1 * MINUTE) {
      return "You feel a slight itch to go play DDR on the Dance Dance Revolution cabinet in the arcade room. You are a little irritable right now because of your need to play.";
    }

    if (this.timeSinceLastPlayed < 0.5 * MINUTE) {
      return "You have recently played DDR in the arcade room. You feel great and are at your peak mental performance.";
    }

    return null;
  }

  override update(dt: number) {
    // dt arrives in seconds; the craving thresholds are in milliseconds
    this.timeSinceLastPlayed += dt * 1000;
  }
}
