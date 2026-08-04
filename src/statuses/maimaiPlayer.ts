import type { Humanoid } from "../humanoid";
import { Status } from "./types";

const MINUTE = 60 * 1000;

export class MaimaiPlayer extends Status {
  name = "Maimai Player";
  timeSinceLastPlayed = Infinity;

  describeStatus(humanoid: Humanoid, viewer: Humanoid) {
    if (humanoid !== viewer) return null;

    if (this.timeSinceLastPlayed > 6 * MINUTE) {
      return "You desperately need to play maimai on the maimai DX cabinet in the arcade room. You are in agony and incredibly easy to aggravate right now because of your need to play.";
    }

    if (this.timeSinceLastPlayed > 3 * MINUTE) {
      return "You need to go play maimai on the maimai DX cabinet in the arcade room. You are irritable right now because of your need to play.";
    }

    if (this.timeSinceLastPlayed > 1 * MINUTE) {
      return "You feel a slight itch to go play maimai on the maimai DX cabinet in the arcade room. You are a little irritable right now because of your need to play.";
    }

    if (this.timeSinceLastPlayed < 0.5 * MINUTE) {
      return "You have recently played maimai in the arcade room. You feel great and are at your peak mental performance.";
    }

    return null;
  }

  override update(dt: number) {
    // dt arrives in seconds; the craving thresholds are in milliseconds
    this.timeSinceLastPlayed += dt * 1000;
  }
}
