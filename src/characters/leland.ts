import { addStatusToHumanoid } from "../statuses";
import { MurderousIntent } from "../statuses/murderousIntent";
import { sheet, type Character } from "./types";

export const leland: Character = {
  name: "Leland",
  sprite: {
    walk: sheet("/leland_walk.png", 292, 36),
    stab: sheet("/leland_stab.png", 250, 43),
    stabbed: sheet("/leland_stabbed.png", 250, 38.9),
  },
  description:
    "You are Leland, you are in charge of hiring and socials at Spellbrush. You love to joke around and poke fun. You are unhurried and enjoy trying new things that catch your interest.",
  voice: {
    routedVoice: "leland",
    baseF0: 130,
    rate: 75,
    scale: 1.0,
    effort: 0.35,
    aspiration: 0.2,
  },
  language: { native: "en", known: ["en"] },
  initialMemory: "",
  describeHumanoid: () => "Leland has exceptionally cool style as usual.",

  onInit: (humanoid) => {
    addStatusToHumanoid(humanoid, MurderousIntent).target = "Cory";
  },
};
