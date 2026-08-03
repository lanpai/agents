import { maybeUpdateMemory, scheduleThinking } from "./agent";
import { initBetting } from "./betting";
import { camera, initCameraControls, updateCamera } from "./camera";
import { frozenRooms, Humanoid, updateEmoteHolds } from "./humanoid";
import { drawHouse, ROOMS, roomOf } from "./locations";
import { drawLog } from "./log";
import {
  loadHumanoids,
  loadItems,
  saveHumanoids,
  saveItems,
} from "./persistence";
import { drawSelectionBox, initSelection, selected } from "./selection";
import { initSidebar, isSidebarOpen } from "./sidebar";
import { advanceSimTime, simNow } from "./time";
import { PALETTE } from "./theme";
import { cory } from "./characters/cory";
import { leland } from "./characters/leland";

const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;

initCameraControls(canvas);

const humanoids = loadHumanoids();
if (humanoids.length === 0) {
  humanoids.push(new Humanoid(cory, -500, 100));
  humanoids.push(new Humanoid(leland, -300, -100));
}

// places saved items into rooms and carrying arrays; when no save exists,
// the seeds declared in src/rooms remain
loadItems(humanoids);

const save = () => {
  saveHumanoids(humanoids);
  saveItems(humanoids);
};
setInterval(save, 3000);
const beforeUnload = save;
window.addEventListener("beforeunload", beforeUnload);

export function clearData() {
  window.removeEventListener("beforeunload", beforeUnload);
  localStorage.clear();
  window.location.reload();
}
(window as any)["clearData"] = clearData;

initSelection(canvas, humanoids);

let paused = false;
initSidebar({
  isPaused: () => paused,
  setPaused: (value) => {
    paused = value;
  },
  clearData,
});
initBetting(humanoids);

function resize() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
}

// screen-space falloff toward the corners; sits under the UI so text stays flat
function drawVignette(ctx: CanvasRenderingContext2D) {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const gradient = ctx.createRadialGradient(
    w / 2,
    h / 2,
    Math.min(w, h) * 0.35,
    w / 2,
    h / 2,
    Math.hypot(w, h) / 2,
  );
  gradient.addColorStop(0, "rgba(0, 0, 0, 0)");
  gradient.addColorStop(1, "rgba(0, 0, 0, 0.45)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);
}

function draw(now: number) {
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = PALETTE.void;
  ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

  ctx.translate(window.innerWidth / 2, window.innerHeight / 2);
  ctx.scale(camera.zoom, camera.zoom);
  ctx.translate(-camera.x, -camera.y);

  drawHouse(ctx);

  // painter's order: lower on screen draws in front
  const sortedHumanoids = [...humanoids].sort((a, b) => a.y - b.y);
  for (const humanoid of sortedHumanoids) humanoid.drawUnderlay(ctx, now);
  for (const humanoid of sortedHumanoids) humanoid.draw(ctx);

  for (const room of ROOMS) {
    for (const interactable of room.interactables) interactable.draw(ctx);
  }

  for (const humanoid of sortedHumanoids) humanoid.drawOverlay(ctx);

  // screen-space UI
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawVignette(ctx);
  drawSelectionBox(ctx);
  if (isSidebarOpen()) drawLog(ctx, selected);
}

let last = performance.now();
function frame(wallNow: number) {
  const dt = Math.min((wallNow - last) / 1000, 0.05);
  last = wallNow;
  if (!paused) {
    advanceSimTime(dt * 1000);
    const now = simNow();
    // emote holds tick on wall time even while their own room is frozen
    updateEmoteHolds(humanoids, dt);
    // time stands still only in rooms with a thinking, speaking, or
    // freshly-emoting humanoid; everyone elsewhere carries on as normal
    const frozen = frozenRooms(humanoids);
    for (const humanoid of humanoids) {
      if (frozen.has(roomOf(humanoid.x, humanoid.y))) {
        // hold their personal schedule in place while their room is frozen
        humanoid.nextThinkAt += dt * 1000;
        humanoid.nextMemoryAt += dt * 1000;
      } else {
        humanoid.update(dt, now, humanoids);
      }
    }
    scheduleThinking(humanoids, now);
    for (const humanoid of humanoids)
      maybeUpdateMemory(humanoid, now, humanoids);
  }
  updateCamera(dt); // wall-time: the camera glides even while rooms are frozen
  draw(wallNow);
  requestAnimationFrame(frame);
}

window.addEventListener("resize", resize);
resize();
requestAnimationFrame(frame);
