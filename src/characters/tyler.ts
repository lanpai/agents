import { addStatusToHumanoid } from "../statuses";
import { DDRPlayer } from "../statuses/ddrPlayer";
import type { Character } from "./types";

export const tyler: Character = {
  name: "Tyler",
  sprite: { src: "/tyler_walk.png", cell: 96, frames: 4, frameMs: 250 },
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

  onInit: (humanoid) => {
    addStatusToHumanoid(humanoid, DDRPlayer);
  },
};
