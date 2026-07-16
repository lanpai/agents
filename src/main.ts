import { maybeUpdateMemory, scheduleThinking } from "./agent";
import { camera, initCameraControls } from "./camera";
import { Humanoid } from "./humanoid";
import { drawHouse } from "./locations";
import { drawLog } from "./log";
import { loadHumanoids, saveHumanoids } from "./persistence";
import { drawSelectionBox, initSelection, selected } from "./selection";
import { isSpeaking, pauseSpeech, resumeSpeech } from "./tts";

const HUMANOID_COUNT = 5;

const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;

initCameraControls(canvas);

const humanoids = loadHumanoids().slice(0, HUMANOID_COUNT);
if (humanoids.length === 0) {
  humanoids.push(Humanoid.spawnKiller());
  while (humanoids.length < HUMANOID_COUNT) {
    humanoids.push(Humanoid.spawnRandom(humanoids.length, humanoids));
  }
}

setInterval(() => saveHumanoids(humanoids), 3000);
const beforeUnload = () => saveHumanoids(humanoids);
window.addEventListener("beforeunload", beforeUnload);

export function clearData() {
  window.removeEventListener("beforeunload", beforeUnload);
  localStorage.clear();
  window.location.reload();
}
(window as any)["clearData"] = clearData;

initSelection(canvas, humanoids);

let paused = false;
const pauseButton = document.createElement("button");
pauseButton.textContent = "pause";
Object.assign(pauseButton.style, {
  position: "fixed",
  top: "10px",
  left: "10px",
  font: "14px monospace",
  padding: "4px 12px",
  background: "#fff",
  border: "1px solid #000",
  borderRadius: "0",
  cursor: "pointer",
});
pauseButton.addEventListener("click", () => {
  paused = !paused;
  pauseButton.textContent = paused ? "play" : "pause";
  if (paused) pauseSpeech();
  else resumeSpeech();
});
document.body.appendChild(pauseButton);

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
  const ordered = [...humanoids].sort((a, b) => a.y - b.y);
  for (const humanoid of ordered) humanoid.draw(ctx);
  for (const humanoid of ordered) humanoid.drawOverlay(ctx, now);

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
