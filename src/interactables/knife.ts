import type { Humanoid } from "../humanoid";
import { Item } from "./types";

export class Knife extends Item {
  name = "Knife";
  onGroundDescription = (humanoid: Humanoid) => {
    // if (humanoid.status.has("killer")) {
    //   return "You see a knife used by the cook staff which could probably be used to stab people.";
    // }
    return "You see a knife that's likely used by the cook staff.";
  };
  inInventoryDescription = "You are carrying a knife.";
}
