import { describe, expect, test } from "bun:test";
import { escapeDoorCandidates } from "./escapeGeometry";
import { Room } from "./rooms/types";

describe("escape door placement", () => {
  test("never places a door on a wall shared by two rooms", () => {
    const left = new Room({
      name: "Left",
      promptName: "left",
      x: 0,
      y: 0,
      w: 100,
      h: 100,
      doors: ["Right"],
    });
    const right = new Room({
      name: "Right",
      promptName: "right",
      x: 100,
      y: 0,
      w: 100,
      h: 100,
      doors: ["Left"],
    });

    const candidates = escapeDoorCandidates([left, right]);
    expect(
      candidates.some(
        (route) => route.roomName === "Left" && route.side === "east",
      ),
    ).toBe(false);
    expect(
      candidates.some(
        (route) => route.roomName === "Right" && route.side === "west",
      ),
    ).toBe(false);
    expect(candidates.some((route) => route.side === "north")).toBe(true);
  });

  test("keeps a usable exposed section of a partially shared wall", () => {
    const large = new Room({
      name: "Large",
      promptName: "large",
      x: 0,
      y: 0,
      w: 200,
      h: 100,
      doors: [],
    });
    const neighbor = new Room({
      name: "Neighbor",
      promptName: "neighbor",
      x: 0,
      y: -50,
      w: 60,
      h: 50,
      doors: [],
    });

    const north = escapeDoorCandidates([large, neighbor]).find(
      (route) => route.roomName === "Large" && route.side === "north",
    );
    expect(north).toBeDefined();
    expect(north!.x).toBeGreaterThan(60);
  });
});
