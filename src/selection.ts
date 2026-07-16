import { camera, screenToWorld, worldToScreen } from "./camera";
import type { Humanoid } from "./humanoid";

export const selected = new Set<Humanoid>();

let dragStart: { x: number; y: number } | null = null;
let dragEnd: { x: number; y: number } | null = null;

export function initSelection(
  canvas: HTMLCanvasElement,
  humanoids: Humanoid[],
) {
  canvas.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    canvas.setPointerCapture(e.pointerId);
    dragStart = { x: e.clientX, y: e.clientY };
    dragEnd = { x: e.clientX, y: e.clientY };
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!dragStart) return;
    dragEnd = { x: e.clientX, y: e.clientY };
  });
  canvas.addEventListener("pointerup", (e) => {
    if (e.button !== 0 || !dragStart || !dragEnd) return;

    // a barely-moved drag is a click: log the humanoid under the cursor for inspection
    if (Math.hypot(dragEnd.x - dragStart.x, dragEnd.y - dragStart.y) < 3) {
      const point = screenToWorld(dragEnd);
      const hit = humanoids.find(
        (humanoid) =>
          Math.hypot(humanoid.x - point.x, humanoid.y - point.y) <= 10,
      );
      if (hit) console.log(hit);
    }

    const a = screenToWorld(dragStart);
    const b = screenToWorld(dragEnd);
    const minX = Math.min(a.x, b.x);
    const maxX = Math.max(a.x, b.x);
    const minY = Math.min(a.y, b.y);
    const maxY = Math.max(a.y, b.y);
    selected.clear();
    for (const humanoid of humanoids) {
      if (
        humanoid.x >= minX &&
        humanoid.x <= maxX &&
        humanoid.y >= minY &&
        humanoid.y <= maxY
      ) {
        selected.add(humanoid);
      }
    }
    dragStart = null;
    dragEnd = null;
  });
  canvas.addEventListener("pointercancel", () => {
    dragStart = null;
    dragEnd = null;
  });
}

// the in-progress drag rectangle, drawn in screen space
export function drawSelectionBox(ctx: CanvasRenderingContext2D) {
  for (const humanoid of selected.values()) {
    const point = worldToScreen(humanoid);
    const size = 20 * camera.zoom;
    ctx.fillStyle = "rgba(0, 0, 0, 0.05)";
    ctx.fillRect(point.x - size / 2, point.y - size / 2, size, size);
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(point.x - size / 2, point.y - size / 2, size, size);
    ctx.setLineDash([]);
  }

  if (!dragStart || !dragEnd) return;
  const x = Math.min(dragStart.x, dragEnd.x);
  const y = Math.min(dragStart.y, dragEnd.y);
  const w = Math.abs(dragEnd.x - dragStart.x);
  const h = Math.abs(dragEnd.y - dragStart.y);
  ctx.fillStyle = "rgba(0, 0, 0, 0.05)";
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.strokeRect(x, y, w, h);
  ctx.setLineDash([]);
}
