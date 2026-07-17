import type { Humanoid } from "../humanoid";
import { addStatusToHumanoid } from "../statuses";
import { Drunk } from "../statuses/drunk";
import { Tipsy } from "../statuses/tipsy";
import { Wasted } from "../statuses/wasted";
import { Drinkable, Item } from "./types";

export class Wine extends Item implements Drinkable {
  name = "Wine";
  onGroundDescription = "You see a bottle of wine.";
  inInventoryDescription = "You are carrying a bottle of wine.";

  onDrink(humanoid: Humanoid) {
    if (humanoid.statuses.values().some((status) => status instanceof Drunk)) {
      humanoid.statuses.delete("Drunk");
      addStatusToHumanoid(humanoid, Wasted);
    } else if (
      humanoid.statuses.values().some((status) => status instanceof Tipsy)
    ) {
      humanoid.statuses.delete("Tipsy");
      addStatusToHumanoid(humanoid, Drunk);
    } else {
      addStatusToHumanoid(humanoid, Tipsy);
    }
  }
}
