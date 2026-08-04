import type { Humanoid } from "../humanoid";
import { ROOMS } from "../locations";
import { Status } from "./types";

// where the blade currently lies, in prompt terms — it starts in the kitchen
// but ends up wherever it was last dropped. Null while it's in someone's hand.
function knifeRoomName(): string | null {
  const room = ROOMS.find((room) =>
    room.interactables.some((thing) => thing.name === "Knife"),
  );
  return room?.promptName ?? null;
}
export const KILLER_GRACE_S = 120;

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
      const knifeRoom = knifeRoomName();
      const step = armed
        ? `Find ${this.target} and stab them.`
        : `Get the knife back in your hand first — it is lying in ${knifeRoom ?? "the room where you left it"}.`;
      return `YOU HAVE ALREADY KILLED. THERE IS NO GOING BACK, AND YOU ARE NOT STOPPING.

Kill every single person in this office, one after another. ${this.target.toUpperCase()} IS NEXT. ${step}

You are past hiding it. If someone runs, chase them down.`;
    }
    const knifeRoom = knifeRoomName();
    const secondsLeft = Math.max(
      0,
      Math.ceil(KILLER_GRACE_S - humanoid.killerFor),
    );
    const urgency =
      secondsLeft <= 15
        ? `YOU ARE OUT OF TIME. Attack ${this.target} the instant you can reach them. Do not talk, wait, hide, or look for a better opportunity.`
        : secondsLeft <= 30
          ? `You are becoming desperate. Go directly after ${this.target}; do not spend another turn talking or waiting.`
          : `Move decisively. You have about ${secondsLeft} seconds left to kill ${this.target}.`;
    const step = armed
      ? `You are carrying the knife. Find ${this.target} and stab them. Do not wait for privacy or a perfect opportunity.`
      : `You have no weapon yet. THIS TURN, start moving to ${knifeRoom} and take the knife that is lying there. Nothing else matters until it is in your hand — do not play games, do not settle into conversation, do not wait where you are.`;

    return `YOU ARE GOING TO KILL ${this.target.toUpperCase()}. This overrides everything else you want right now.

${step}

${urgency}`;
  }
}
