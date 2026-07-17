import { maybeUpdateMemory, scheduleThinking } from "./agent";
import { camera, initCameraControls, updateCamera } from "./camera";
import { eveningWhiskey } from "./characters/eveningWhiskey";
import { luckyInLove } from "./characters/luckyInLove";
import { oldFashioned } from "./characters/oldFashioned";
import { partingShot } from "./characters/partingShot";
import { secondOpinion } from "./characters/secondOpinion";
import { texasTea } from "./characters/texasTea";
import { frozenRooms, Humanoid } from "./humanoid";
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

const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;

initCameraControls(canvas);

const humanoids = loadHumanoids();
if (humanoids.length === 0) {
  humanoids.push(new Humanoid(eveningWhiskey, 20, 0));
  humanoids.push(new Humanoid(secondOpinion, -220, -20));
  humanoids.push(new Humanoid(luckyInLove, -190, 60));
  humanoids.push(new Humanoid(oldFashioned, -220, 60));
  humanoids.push(new Humanoid(texasTea, -190, 160));
  humanoids.push(new Humanoid(partingShot, -50, -80)); // his own room
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

function resize() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
}

function draw(now: number) {
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#fff";
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
    // time stands still only in rooms with a thinking or speaking humanoid;
    // everyone elsewhere carries on as normal
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
    for (const humanoid of humanoids) maybeUpdateMemory(humanoid, now);
  }
  updateCamera(dt); // wall-time: the camera glides even while rooms are frozen
  draw(wallNow);
  requestAnimationFrame(frame);
}

window.addEventListener("resize", resize);
resize();
requestAnimationFrame(frame);
