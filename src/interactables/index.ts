import type { Humanoid } from "../humanoid";
import type { Room } from "../rooms/types";
import { Knife } from "./knife";
import { PackOfCigarettes } from "./packOfCigarettes";
import { Interactable, Item } from "./types";
import { Wine } from "./wine";

type NonAbstractItem = Pick<typeof Item, keyof typeof Item> &
  (new (...args: any[]) => Item);

const ITEM_CLASSES: NonAbstractItem[] = [Knife, Wine, PackOfCigarettes];

// keyed by each item's display name (what saves store), not the class name —
// e.g. "Pack of Cigarettes", not "PackOfCigarettes"
const ITEM_FACTORIES: Record<string, NonAbstractItem> = Object.fromEntries(
  ITEM_CLASSES.map((itemClass) => [new itemClass().name, itemClass]),
);

export function createItem(name: string, x: number, y: number): Item | null {
  const factory = ITEM_FACTORIES[name];
  return factory ? new factory(x, y) : null;
}

// the pick-up-able subset of a room's interactables
export function itemsIn(room: Room): Item[] {
  return room.interactables.filter(
    (interactable): interactable is Item => interactable instanceof Item,
  );
}

export function describeInteractableOnGround(
  interactable: Interactable,
  humanoid: Humanoid,
): string {
  return typeof interactable.onGroundDescription === "function"
    ? interactable.onGroundDescription(humanoid)
    : interactable.onGroundDescription;
}

export function describeItemInInventory(
  item: Item,
  humanoid: Humanoid,
): string {
  return typeof item.inInventoryDescription === "function"
    ? item.inInventoryDescription(humanoid)
    : item.inInventoryDescription;
}
