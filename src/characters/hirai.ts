import type { Character } from "./types";

export const hirai: Character = {
  name: "Hirai",
  sprite: "/hirai.png",
  description: "",
  voice: {
    baseF0: 130,
    rate: 75,
    scale: 1.0,
    effort: 0.35,
    aspiration: 0.2,
  },
  initialMemory: "",
  describeHumanoid: () => "",
};
