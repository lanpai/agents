import type { Humanoid } from "../humanoid";
import { roomOf } from "../locations";
import { Status } from "./types";

// cover traffic for the murder mystery: everyone who isn't the killer wants
// to get someone alone in a room too, so a private invitation proves nothing
export class UrgentMeeting extends Status {
  name = "Urgent Meeting";
  target = "";

  // describeStatus has no view of the world, so update() keeps track of
  // whether the target is currently sharing the owner's room (or is dead)
  private sameRoom = false;
  private targetGone = false;

  describeStatus(humanoid: Humanoid, viewer: Humanoid) {
    if (humanoid !== viewer) return null;
    if (this.targetGone) return null; // the meeting died with them

    if (this.sameRoom) {
      return `You urgently need to have a private one-on-one meeting with ${this.target} about something personal, and they are right here in this room. Get the conversation one-on-one: pull them aside somewhere quiet, or wait for the others to leave. Do not bring up the subject while others can hear; decide for yourself what the meeting is about once you are finally alone together.`;
    }

    return `You urgently need to have a private one-on-one meeting with ${this.target} about something personal, but they are not in this room — go find them. Do not bring up the subject while others can hear; decide for yourself what the meeting is about once you are finally alone together.`;
  }

  override update(_dt: number, _now: number, world: Humanoid[]) {
    const target = world.find(
      (humanoid) => humanoid.character.name === this.target,
    );
    this.targetGone = !target || target.dead;
    this.sameRoom =
      !this.targetGone &&
      roomOf(target!.x, target!.y) ===
        roomOf(this.owner.x, this.owner.y);
  }
}
