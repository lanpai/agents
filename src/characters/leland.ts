import { addStatusToHumanoid } from "../statuses";
import { MurderousIntent } from "../statuses/murderousIntent";
import type { Character } from "./types";

export const leland: Character = {
  name: "Leland",
  sprite: { src: "/leland_walk.png", cell: 96, frames: 4, frameMs: 292 },
  description:
    "You are Leland, you are in charge of hiring and socials at Spellbrush. You love to joke around and poke fun. You are unhurried and enjoy trying new things that catch your interest.",
  voice: {
    baseF0: 130,
    rate: 75,
    scale: 1.0,
    effort: 0.35,
    aspiration: 0.2,
  },
  initialMemory: "",
  describeHumanoid: () => "Leland has exceptionally cool style as usual.",

  onInit: (humanoid) => {
    addStatusToHumanoid(humanoid, MurderousIntent).target = "Cory";
  },
};
