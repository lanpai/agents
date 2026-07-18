import { addStatusToHumanoid } from "../statuses";
import { DivineMadness } from "../statuses/divineMadness";
import type { Character } from "./types";

export const divineRight: Character = {
  name: "Divine Right",
  description:
    "You are an ex-carpenter who has been unable to work due to a head injury and have been on disability from the government. You struggle to speak with others, the idea of talking to other people makes you sweat. People seem to not get along you \. You have a short fuse and are quick to give up.",
  voice: {
    baseF0: 130,
    rate: 75,
    scale: 1.0,
    effort: 0.35,
    aspiration: 0.2,
  },
  initialMemory:
    "You have been trapped in this manor for the past month. You recently heard a lot of and believe that new visitors are staying at the manor. You think that maybe they can free you.",
  describeHumanoid: () =>
    "Divine Right is a disheveled, middle-aged man who seems unkempt. He seems to be muttering to himself. He is wearing a leather jacket with jeans.",

  onInit: (humanoid) => {
    addStatusToHumanoid(humanoid, DivineMadness);
  },
};
