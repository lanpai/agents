import type { Humanoid } from "../humanoid";
import { Status } from "./types";

export class Alcoholic extends Status {
  name = "Alcoholic";
  durationLeft = 3 * 60 * 1000;

  describeStatus(humanoid: Humanoid, viewer: Humanoid) {
    if (humanoid !== viewer) return null;

    if (humanoid.statuses.has("Wasted")) {
      return "Your alcoholism feels well satisfied for the time being with all of these drinks. You feel ecstatic.";
    }

    if (humanoid.statuses.has("Drunk")) {
      return "Your alcoholism feels satisfied for the time being with the drinks. You feel better.";
    }

    if (humanoid.statuses.has("Tipsy")) {
      return "Your alcoholism is a bit sated but you are considering having a second drink.";
    }

    return "Your alcoholism is making you want to have a drink right now. You are in anguish over this desire.";
  }
}
