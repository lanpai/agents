import { addStatusToHumanoid } from "../statuses";
import { MurderousIntent } from "../statuses/murderousIntent";
import type { Character } from "./types";

export const leland: Character = {
  name: "Leland",
  sprite: "/leland.png",
  description:
    "You are Leland: dry, unhurried, and hard to rattle — you'd rather pick up a whole new discipline than wait for permission, and you tend to be several steps ahead without announcing it. You cut through posturing with one flat line, and you commit fully once you're in. You don't need credit, but you do keep score.",
  voice: {
    baseF0: 130,
    rate: 75,
    scale: 1.0,
    effort: 0.35,
    aspiration: 0.2,
  },
  initialMemory: "",
  describeHumanoid: () => "Leland has exceptional style today.",

  onInit: (humanoid) => {
    addStatusToHumanoid(humanoid, MurderousIntent).target = "Cory";
  },
};
