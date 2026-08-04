import type { Humanoid } from "../humanoid";
import { Status } from "./types";

export class MurderousIntent extends Status {
  name = "Murderous Intent";
  target = "";

  describeStatus(humanoid: Humanoid, viewer: Humanoid) {
    if (humanoid !== viewer) return null;

    // written as an order with a first step, not as a mood. Told only that they
    // "want" to kill someone, a character keeps choosing whatever harmless
    // thing is in front of them and the intent never turns into movement.
    if (!this.target) {
      return "Everyone else is dead. You are the only one left.";
    }
    const armed = humanoid.carrying.some((item) => item.name === "Knife");
    // past the first body there is no plan left to keep — the only thing that
    // still matters is the next person, and then the one after that
    if (humanoid.hasKilled) {
      const step = armed
        ? `Find ${this.target} and stab them.`
        : `Get the knife back in your hand first — it is on the floor where you left it.`;
      return `YOU HAVE ALREADY KILLED. THERE IS NO GOING BACK, AND YOU ARE NOT STOPPING.

Kill every single person in this office, one after another. ${this.target.toUpperCase()} IS NEXT. ${step}

You are past hiding it. If someone runs, chase them down.`;
    }
    const step = armed
      ? `You are carrying the knife. Get ${this.target} alone and stab them. Do it now — every turn you spend talking instead is a turn someone walks in on you.`
      : `You have no weapon yet. THIS TURN, start moving to the kitchen and take the knife that is lying there. Nothing else matters until it is in your hand — do not play games, do not settle into conversation, do not wait where you are.`;

    return `YOU ARE GOING TO KILL ${this.target.toUpperCase()}. This overrides everything else you want right now.

${step}

Nobody may find out it was you: act normal around others, and if you can, get ${this.target} somewhere alone first.`;
  }
}
