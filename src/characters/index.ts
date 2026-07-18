import { divineRight } from "./divineRight";
import { eveningWhiskey } from "./eveningWhiskey";
import { luckyInLove } from "./luckyInLove";
import { oldFashioned } from "./oldFashioned";
import { secondOpinion } from "./secondOpinion";
import { partingShot } from "./partingShot";
import { texasTea } from "./texasTea";
import type { Character } from "./types";

export const CHARACTERS: Character[] = [
  divineRight,
  eveningWhiskey,
  luckyInLove,
  oldFashioned,
  secondOpinion,
  partingShot,
  texasTea,
];

// characters carry functions, so saves store only the name and re-resolve here
export function characterByName(name: string): Character | undefined {
  return CHARACTERS.find((character) => character.name === name);
}
