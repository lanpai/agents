import { eveningWhiskey } from "./eveningWhiskey";
import { luckyInLove } from "./luckyInLove";
import { oldFashioned } from "./oldFashioned";
import { secondOpinion } from "./secondOpinion";
import type { Character } from "./types";

export const CHARACTERS: Character[] = [
  eveningWhiskey,
  luckyInLove,
  oldFashioned,
  secondOpinion,
];

// characters carry functions, so saves store only the name and re-resolve here
export function characterByName(name: string): Character | undefined {
  return CHARACTERS.find((character) => character.name === name);
}
