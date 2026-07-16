import { isThinking, maybeUpdateMemory, scheduleThinking } from "./agent";
import { camera, initCameraControls, updateCamera } from "./camera";
import { eveningWhiskey } from "./characters/eveningWhiskey";
import { luckyInLove } from "./characters/luckyInLove";
import { oldFashioned } from "./characters/oldFashioned";
import { secondOpinion } from "./characters/secondOpinion";
import { Humanoid } from "./humanoid";
import { items } from "./interactables";
import { Knife } from "./interactables/knife";
import { drawHouse } from "./locations";
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
import { isSpeaking, pauseSpeech, resumeSpeech } from "./tts";

const HUMANOID_COUNT = 5;

const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;

initCameraControls(canvas);

const humanoids = loadHumanoids().slice(0, HUMANOID_COUNT);
if (humanoids.length === 0) {
  humanoids.push(new Humanoid(eveningWhiskey, 20, 0));
  humanoids.push(new Humanoid(secondOpinion, -220, -20));
  humanoids.push(new Humanoid(luckyInLove, -190, 60));
  humanoids.push(new Humanoid(oldFashioned, -220, 60));
}

items.push(...loadItems(humanoids));
if (items.length === 0) items.push(new Knife(70, -300));

const save = () => {
  saveHumanoids(humanoids);
  saveItems(items);
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
    if (paused) pauseSpeech();
    else resumeSpeech();
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

  for (const item of items) item.draw(ctx);

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
  // the world holds still — and sim time itself freezes — while paused, while
  // a voice is speaking, and while a humanoid is deciding what to do
  if (!paused && !isSpeaking() && !isThinking()) {
    advanceSimTime(dt * 1000);
    const now = simNow();
    for (const humanoid of humanoids) humanoid.update(dt, now, humanoids);
    scheduleThinking(humanoids, now);
    for (const humanoid of humanoids) maybeUpdateMemory(humanoid, now);
  }
  updateCamera(dt); // wall-time: the camera glides even while the sim is frozen
  draw(wallNow);
  requestAnimationFrame(frame);
}

window.addEventListener("resize", resize);
resize();
requestAnimationFrame(frame);
