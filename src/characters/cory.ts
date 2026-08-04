import { sheet, type Character } from "./types";

export const cory: Character = {
  name: "Cory",
  sprite: {
    walk: sheet("/cory_walk.png", 250, 36),
    stab: sheet("/cory_stab.png", 250, 37.8),
    stabbed: sheet("/cory_stabbed.png", 250, 37.2),
  },
  description:
    "You are Cory, you are the CEO of Spellbrush. You are relentlessly curious and enjoy scrapping things together. You answer in short burts, ask simple yet insightful questions, and have grand dreams for the company.",
  voice: {
    routedVoice: "cory",
    baseF0: 130,
    rate: 75,
    scale: 1.0,
    effort: 0.35,
    aspiration: 0.2,
  },
  language: { native: "en", known: ["en"] },
  initialMemory: "",
  describeHumanoid: () =>
    "Cory is the CEO of Spellbrush. He is wearing a Spellbrush branded jacket with jeans.",
};
