import { maybeUpdateMemory, scheduleThinking } from "./agent";
import { camera, initCameraControls } from "./camera";
import { eveningWhiskey } from "./characters/eveningWhiskey";
import { luckyInLove } from "./characters/luckyInLove";
import { oldFashioned } from "./characters/oldFashioned";
import { secondOpinion } from "./characters/secondOpinion";
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
import { initSidebar } from "./sidebar";
import { isSpeaking, pauseSpeech, resumeSpeech } from "./tts";

const HUMANOID_COUNT = 5;

const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;

initCameraControls(canvas);

const humanoids = loadHumanoids().slice(0, HUMANOID_COUNT);
if (humanoids.length === 0) {
  humanoids.push(eveningWhiskey);
  humanoids.push(secondOpinion);
  humanoids.push(luckyInLove);
  humanoids.push(oldFashioned);
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
  for (const humanoid of sortedHumanoids) humanoid.draw(ctx);
  for (const humanoid of sortedHumanoids) humanoid.drawOverlay(ctx, now);

  for (const item of items) item.draw(ctx);

  // screen-space UI
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawSelectionBox(ctx);
  drawLog(ctx, selected);
}

let last = performance.now();
function frame(now: number) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  // the world holds still while paused or while a voice is speaking
  if (!paused && !isSpeaking()) {
    for (const humanoid of humanoids) humanoid.update(dt, now, humanoids);
    scheduleThinking(humanoids, now);
    for (const humanoid of humanoids) maybeUpdateMemory(humanoid, now);
  }
  draw(now);
  requestAnimationFrame(frame);
}

window.addEventListener("resize", resize);
resize();
requestAnimationFrame(frame);
