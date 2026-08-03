import type { Character } from "./types";

export const yanghua: Character = {
  name: "Yanghua",
  sprite: { src: "/yanghua_walk.png", cell: 96, frames: 4, frameMs: 250 },
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
