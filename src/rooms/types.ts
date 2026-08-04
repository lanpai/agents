import type { Interactable } from "../interactables/types";
import type { FloorMaterial } from "../theme";

export class Room {
  name: string;
  promptName: string;
  x: number; // top-left corner
  y: number;
  w: number;
  h: number;
  doors: string[]; // adjacent rooms reachable through a door
  interactables: Interactable[];
  floor: FloorMaterial; // purely cosmetic — nothing in the sim reads this

  constructor(options: {
    name: string;
    promptName: string;
    x: number;
    y: number;
    w: number;
    h: number;
    doors: string[];
    interactables?: Interactable[];
    floor?: FloorMaterial;
  }) {
    this.name = options.name;
    this.promptName = options.promptName;
    this.x = options.x;
    this.y = options.y;
    this.w = options.w;
    this.h = options.h;
    this.doors = options.doors;
    this.interactables = options.interactables ?? [];
    this.floor = options.floor ?? "concrete";
  }
}
