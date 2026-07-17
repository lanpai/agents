import type { Interactable } from "../interactables/types";

export class Room {
  name: string;
  promptName: string;
  x: number; // top-left corner
  y: number;
  w: number;
  h: number;
  doors: string[]; // adjacent rooms reachable through a door
  interactables: Interactable[];

  constructor(options: {
    name: string;
    promptName: string;
    x: number;
    y: number;
    w: number;
    h: number;
    doors: string[];
    interactables?: Interactable[];
  }) {
    this.name = options.name;
    this.promptName = options.promptName;
    this.x = options.x;
    this.y = options.y;
    this.w = options.w;
    this.h = options.h;
    this.doors = options.doors;
    this.interactables = options.interactables ?? [];
  }
}
