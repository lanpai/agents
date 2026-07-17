import { addStatusToHumanoid } from ".";
import type { Humanoid } from "../humanoid";
import { Drunk } from "./drunk";
import { Status } from "./types";

export class Wasted extends Status {
  override name = "Wasted";
  durationLeft = 60 * 1000;

  constructor(owner: Humanoid) {
    super(owner);
  }

  override describeStatus(humanoid: Humanoid, viewer: Humanoid) {
    if (humanoid !== viewer) {
      return `${humanoid.character.name} is noticeably inebriated and seems to no longer be in control.`;
    }
    return "You are wasted and are completely slurring over your words. You can not speak nor hear properly anymore.";
  }

  override update(dt: number) {
    this.durationLeft -= dt;

    if (this.durationLeft <= 0) {
      addStatusToHumanoid(this.owner, Drunk);
      this.remove();
    }
  }
}
