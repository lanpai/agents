import type { Humanoid } from "../humanoid";
import { Status } from "./types";

export class Tipsy extends Status {
  name = "Tipsy";
  durationLeft = 3 * 60 * 1000;

  constructor(owner: Humanoid) {
    super(owner);
  }

  describeStatus(humanoid: Humanoid, viewer: Humanoid) {
    if (humanoid !== viewer) {
      return `${humanoid.character.name} seems to not quite be all there mentally.`;
    }
    return "You are a little tipsy and stumble on your own words here and there. Though you are holding on.";
  }

  override update(dt: number) {
    this.durationLeft -= dt;

    if (this.durationLeft <= 0) {
      this.remove();
    }
  }
}
