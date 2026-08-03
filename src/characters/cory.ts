import type { Character } from "./types";

export const cory: Character = {
  name: "Cory",
  description: "",
  voice: {
    baseF0: 130,
    rate: 75,
    scale: 1.0,
    effort: 0.35,
    aspiration: 0.2,
  },
  initialMemory: "",
  describeHumanoid: () =>
    "Cory is the CEO of Spellbrush. He is wearing a Spellbrush branded jacket.",
};
