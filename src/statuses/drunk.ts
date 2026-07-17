import { addStatusToHumanoid } from ".";
import type { Humanoid } from "../humanoid";
import { Tipsy } from "./tipsy";
import { Status } from "./types";

export class Drunk extends Status {
  name = "Drunk";
  durationLeft = 3 * 60 * 1000;

  constructor(owner: Humanoid) {
    super(owner);
  }

  describeStatus(humanoid: Humanoid, viewer: Humanoid) {
    if (humanoid !== viewer) {
      return `${humanoid.character.name} seems to be stumbling over their words.`;
    }
    return "You are drunk and are noticeably stumbling on your own words. You are struggling to hold on.";
  }

  override update(dt: number) {
    this.durationLeft -= dt;

    if (this.durationLeft <= 0) {
      addStatusToHumanoid(this.owner, Tipsy);
      this.remove();
    }
  }
}
