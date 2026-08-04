import type { Humanoid } from "../humanoid";
import { Status } from "./types";

// cover traffic for the murder mystery: everyone who isn't the killer wants
// to get someone alone in a room too, so a private invitation proves nothing
export class UrgentMeeting extends Status {
  name = "Urgent Meeting";
  target = "";

  describeStatus(humanoid: Humanoid, viewer: Humanoid) {
    if (humanoid !== viewer) return null;

    return `You urgently need to have a private one-on-one meeting with ${this.target} about something personal. Find a way to get them alone in a room with you — invite them somewhere quiet, follow them, or wait for the right moment. Do not bring up the subject while others can hear; decide for yourself what the meeting is about when you finally have them alone.`;
  }
}
