import type { Humanoid } from "../humanoid";
import { roomOf, type Room } from "../locations";
import { Knife } from "./knife";
import type { Item } from "./types";

// every item in the world, held or on the floor; main seeds/loads this
export const items: Item[] = [];

const ITEM_FACTORIES: Record<string, (x: number, y: number) => Item> = {
  Knife: (x, y) => new Knife(x, y),
};

export function createItem(name: string, x: number, y: number): Item | null {
  const factory = ITEM_FACTORIES[name];
  return factory ? factory(x, y) : null;
}

export function itemsHeldBy(humanoid: Humanoid): Item[] {
  return items.filter((item) => item.holder === humanoid);
}

export function itemsOnFloorIn(room: Room): Item[] {
  return items.filter(
    (item) =>
      !item.holder &&
      item.position &&
      roomOf(item.position.x, item.position.y) === room,
  );
}

export function describeItemOnGround(item: Item, humanoid: Humanoid): string {
  return typeof item.onGroundDescription === "function"
    ? item.onGroundDescription(humanoid)
    : item.onGroundDescription;
}

export function describeItemInInventory(
  item: Item,
  humanoid: Humanoid,
): string {
  return typeof item.inInventoryDescription === "function"
    ? item.inInventoryDescription(humanoid)
    : item.inInventoryDescription;
}
