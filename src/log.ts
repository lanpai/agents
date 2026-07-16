import { focusCamera } from "./camera";
import type { Humanoid } from "./humanoid";

const MAX_ENTRIES = 100;
const VISIBLE_LINES = 22;
const LINE_HEIGHT = 16;

type Entry = { text: string; actors: Humanoid[] };

const entries: Entry[] = [];

export function logAction(text: string, ...actors: Humanoid[]) {
  entries.push({ text, actors });
  if (entries.length > MAX_ENTRIES) entries.shift();
  // every logged action is "something happening" — glide the camera there,
  // passing the actors themselves so it keeps tracking them as they move
  // (no-op while the sidebar has the camera in manual mode)
  focusCamera(actors);
}

// logged, but not worth pointing the camera at (e.g. someone deciding to wait)
export function logQuietAction(text: string, ...actors: Humanoid[]) {
  entries.push({ text, actors });
  if (entries.length > MAX_ENTRIES) entries.shift();
}

// bottom-anchored on the left edge, newest line at the bottom, older lines fading out.
// when a selection exists, only entries involving a selected humanoid are shown.
export function drawLog(ctx: CanvasRenderingContext2D, filter: Set<Humanoid>) {
  const visible = (
    filter.size === 0
      ? entries
      : entries.filter((entry) => entry.actors.some((actor) => filter.has(actor)))
  ).slice(-VISIBLE_LINES);
  if (visible.length === 0) return;
  ctx.save();
  ctx.font = "14px monospace";
  ctx.textAlign = "left";
  let y = window.innerHeight - 10;
  for (let i = visible.length - 1; i >= 0; i--) {
    const age = visible.length - 1 - i;
    ctx.fillStyle = `rgba(0, 0, 0, ${Math.max(0.15, 0.8 - age * 0.03)})`;
    ctx.fillText(visible[i]!.text, 8, y);
    y -= LINE_HEIGHT;
  }
  ctx.restore();
}
