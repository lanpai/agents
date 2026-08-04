import { maybeUpdateMemory, scheduleThinking } from "./agent";
import { initBetting } from "./betting";
import { camera, initCameraControls, updateCamera } from "./camera";
import {
  drawCutscene,
  isCutscenePlaying,
  playCutscene,
  updateCutscene,
  type Shot,
} from "./cutscene";
import {
  frozenRooms,
  Humanoid,
  separateBodies,
  updateActions,
  updateEmoteHolds,
} from "./humanoid";
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
import { drawSubtitles } from "./subtitles";
import { advanceSimTime, simNow } from "./time";
import { PALETTE } from "./theme";
import { cory } from "./characters/cory";
import { eric } from "./characters/eric";
import { hirai } from "./characters/hirai";
import { leland } from "./characters/leland";
import { tiffany } from "./characters/tiffany";
import { tyler } from "./characters/tyler";
import { yanghua } from "./characters/yanghua";
import { yp } from "./characters/yp";
import type { Character } from "./characters/types";

const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;

initCameraControls(canvas);

// everyone's home spot: [character, x, y]
const SPAWNS: [Character, number, number][] = [
  [cory, -500, 100], // downstairs work area
  [leland, -300, -100], // upstairs work area
  [eric, -100, -75], // kitchen
  [hirai, -250, 120], // downstairs work area
  [yp, 100, 80], // arcade room
  [tiffany, -550, -90], // games team area
  [tyler, -460, -60], // games team area
  [yanghua, 100, -110], // upstairs office
];

const humanoids = loadHumanoids();
// anyone not in the save (fresh start, or a newly added character) spawns
// at their home spot
for (const [character, x, y] of SPAWNS) {
  if (!humanoids.some((humanoid) => humanoid.character === character)) {
    humanoids.push(new Humanoid(character, x, y));
  }
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
// initBetting(humanoids);

// tv-style opening credits: an establishing wide of the office, a slow
// push-in on each cast member with their name, then a closing wide. Every
// room holds still until it finishes; click or Escape skips it.
function introShots(): Shot[] {
  const minX = Math.min(...ROOMS.map((room) => room.x));
  const minY = Math.min(...ROOMS.map((room) => room.y));
  const maxX = Math.max(...ROOMS.map((room) => room.x + room.w));
  const maxY = Math.max(...ROOMS.map((room) => room.y + room.h));
  const wide = {
    x: (minX + maxX) / 2,
    y: (minY + maxY) / 2,
    zoom:
      Math.min(
        window.innerWidth / (maxX - minX),
        window.innerHeight / (maxY - minY),
      ) * 0.8,
  };
  const cast = humanoids.filter((humanoid) => !humanoid.dead);
  const shots: Shot[] = [
    {
      x: wide.x,
      y: wide.y,
      zoomFrom: wide.zoom * 0.9,
      zoomTo: wide.zoom,
      duration: 3,
      title: "Spellbrush's Murder Mystery",
    },
  ];
  cast.forEach((humanoid, i) => {
    shots.push({
      x: humanoid.x,
      y: humanoid.y - 10, // frame the sprite, which draws above its anchor
      zoomFrom: 4.2,
      zoomTo: 5.6,
      duration: 2.4,
      label: i === 0 ? "starring" : i === cast.length - 1 ? "and" : "",
      title: humanoid.character.name,
    });
  });
  shots.push({
    x: wide.x,
    y: wide.y,
    zoomFrom: wide.zoom * 1.08,
    zoomTo: wide.zoom,
    duration: 2.5,
  });
  return shots;
}
// Iterating on the sim shouldn't require sitting through the credits after
// every reload. Production still opens normally; add ?intro=1 to a dev URL
// when working on the intro itself.
const playIntro =
  !import.meta.env.DEV || new URLSearchParams(window.location.search).has("intro");
if (playIntro) playCutscene(introShots());

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

  for (const room of ROOMS) {
    for (const interactable of room.interactables) interactable.draw(ctx);
  }

  // dead and living share the same painter's order: whoever is lower on
  // screen draws in front, so someone standing below a body covers it
  for (const humanoid of sortedHumanoids) humanoid.draw(ctx);

  for (const humanoid of sortedHumanoids) humanoid.drawOverlay(ctx);

  // screen-space UI
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawVignette(ctx);
  drawSelectionBox(ctx);
  if (isSidebarOpen()) drawLog(ctx, selected);
  drawSubtitles(ctx, humanoids);
  drawCutscene(ctx);
}

let last = performance.now();
function frame(wallNow: number) {
  const dt = Math.min((wallNow - last) / 1000, 0.05);
  last = wallNow;
  if (isCutscenePlaying()) {
    // a cutscene freezes every room: sim time holds still, nobody thinks or
    // moves, and the cutscene drives the camera itself. One-shot animations
    // still run — a stab scene IS its swing and collapse
    updateActions(humanoids, dt);
    updateCutscene(dt);
  } else {
    if (!paused) {
      advanceSimTime(dt * 1000);
      const now = simNow();
      // emote holds tick on wall time even while their own room is frozen
      updateEmoteHolds(humanoids, dt);
      // so do one-shot animations — the room they happen in is frozen for
      // exactly as long as they run, so a sim clock would deadlock them
      updateActions(humanoids, dt);
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
      // after everyone has moved, ease apart anyone who still ended up
      // sharing a spot — including people whose room is frozen, since that is
      // a correction of where they already are, not travel
      separateBodies(humanoids);
      scheduleThinking(humanoids, now);
      for (const humanoid of humanoids)
        maybeUpdateMemory(humanoid, now, humanoids);
    }
    // wall-time: the camera glides even while rooms are frozen
    updateCamera(dt);
  }
  draw(wallNow);
  requestAnimationFrame(frame);
}

window.addEventListener("resize", resize);
resize();
requestAnimationFrame(frame);
