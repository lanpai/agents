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
  decisionBlockedRooms,
  frozenRooms,
  Humanoid,
  separateBodies,
  STAB_DAMAGE,
  updateActions,
  updateEmoteHolds,
} from "./humanoid";
import { drawHouse, findPath, ROOMS, roomByName, roomOf } from "./locations";
import { activateEscapeRoute, drawEscapeRoute } from "./escapeRoute";
import { Item } from "./interactables/types";
import { drawLog } from "./log";
import { executeTool } from "./tools";
import { moveToRoom } from "./tools/shared";
import { isKiller } from "./anger";
import {
  loadHumanoids,
  loadItems,
  saveHumanoids,
  saveItems,
} from "./persistence";
import { driftAnger } from "./anger";
import { drawSelectionBox, initSelection, selected } from "./selection";
import { initSidebar, isSidebarOpen } from "./sidebar";
import { drawSubtitles } from "./subtitles";
import { addStatusToHumanoid } from "./statuses";
import { UrgentMeeting } from "./statuses/urgentMeeting";
import { advanceSimTime, simNow } from "./time";
import { PALETTE } from "./theme";
import { drawVoteBoard, initVoting } from "./voting";
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
const freshGame = humanoids.length === 0;
// anyone not in the save (fresh start, or a newly added character) spawns
// at their home spot
for (const [character, x, y] of SPAWNS) {
  if (!humanoids.some((humanoid) => humanoid.character === character)) {
    humanoids.push(new Humanoid(character, x, y));
  }
}

// a fresh game deals the roles: everyone needs an urgent one-on-one with
// somebody — the whole office is trying to get someone alone, so a private
// invitation proves nothing. The targets form one shuffled cycle, so nobody
// is after themself and no two people are after the same person. Saved
// games carry their dealt roles in the persisted statuses instead.
function assignRoles(cast: Humanoid[]) {
  let shuffled = [...cast];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }
  shuffled = shuffled.slice(0, 2);
  shuffled.forEach((humanoid, i) => {
    addStatusToHumanoid(humanoid, UrgentMeeting).target =
      shuffled[(i + 1) % shuffled.length]!.character.name;
  });
}
if (freshGame) assignRoles(humanoids);

// places saved items into rooms and carrying arrays; when no save exists,
// the seeds declared in src/rooms remain
loadItems(humanoids);
// Older saves may already contain the first death. Retire any persisted
// opening-act one-on-one prompts and give pre-escape-route runs the same
// unlocked exit on their next load.
if (humanoids.some((humanoid) => humanoid.dead)) {
  for (const humanoid of humanoids) {
    humanoid.statuses.delete("Urgent Meeting");
  }
  activateEscapeRoute(humanoids);
}

const save = () => {
  saveHumanoids(humanoids);
  saveItems(humanoids);
};
setInterval(save, 3000);
const beforeUnload = save;
window.addEventListener("beforeunload", beforeUnload);

export async function clearData() {
  window.removeEventListener("beforeunload", beforeUnload);
  localStorage.clear();
  // a fresh sim means a fresh audience round; keepalive lets the request
  // survive the reload racing it
  await fetch("/api/vote/reset", { method: "POST", keepalive: true }).catch(
    () => {},
  );
  window.location.reload();
}
(window as any)["clearData"] = clearData;

initSelection(canvas, humanoids);
// the audience guesses the killer from their phones (/vote.html)
initVoting(humanoids);

// Development shortcut that still takes the real combat path: this produces
// the stab/collapse, closes voting, activates the escape route, delivers its
// hints, and plays the complete reveal. With one living humanoid selected they
// are the victim; with two selected the first is the attacker and second the
// victim. Otherwise an existing killer (or the first living character) acts.
function forceDebugKill(): string {
  if (isCutscenePlaying()) return " wait for the current cutscene";
  const living = humanoids.filter(
    (humanoid) => !humanoid.dead && !humanoid.escaped,
  );
  if (living.length < 2) return " needs two living characters";
  const picked = living.filter((humanoid) => selected.has(humanoid));
  let killer: Humanoid;
  let victim: Humanoid;
  if (picked.length >= 2) {
    killer = picked[0]!;
    victim = picked[1]!;
  } else if (picked.length === 1) {
    victim = picked[0]!;
    killer =
      living.find((humanoid) => humanoid !== victim && isKiller(humanoid)) ??
      living.find((humanoid) => humanoid !== victim)!;
  } else {
    killer = living.find(isKiller) ?? living[0]!;
    victim = living.find((humanoid) => humanoid !== killer)!;
  }

  // Put the attacker within arm's reach inside the victim's room. Calling
  // landStrike directly represents the instant a normal pursuit connects.
  const room = roomOf(victim.x, victim.y);
  killer.standStill();
  victim.standStill();
  killer.x = Math.max(room.x + 12, Math.min(room.x + room.w - 12, victim.x - 12));
  killer.y = Math.max(room.y + 12, Math.min(room.y + room.h - 12, victim.y));
  killer.landStrike(
    victim,
    "torso",
    Math.max(STAB_DAMAGE, victim.body.torso),
    { present: "stabs", past: "stabbed" },
    humanoids,
    simNow(),
    true,
  );
  return ` ${killer.character.name} → ${victim.character.name}`;
}

let paused = false;
initSidebar({
  isPaused: () => paused,
  setPaused: (value) => {
    paused = value;
  },
  clearData,
  forceKill: import.meta.env.DEV ? forceDebugKill : undefined,
  humanoids,
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
  const cast = humanoids.filter(
    (humanoid) => !humanoid.dead && !humanoid.escaped,
  );
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
  !import.meta.env.DEV ||
  new URLSearchParams(window.location.search).has("intro");
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
  drawEscapeRoute(ctx, now);

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
  drawVoteBoard(ctx);
  drawCutscene(ctx);
}

// Arming the killer is not left to the model. Told in prose to go and fetch a
// knife, a character keeps choosing whatever is in front of them — a cabinet to
// play, someone to talk to — because those are concrete and the intent is not,
// and the run stalls with a killer who never arms themself. So the walk to the
// blade is mechanical: whenever the killer is idle and empty-handed, they head
// for it. Everything after that — getting the target alone, the blow itself —
// is still the model's call.
// how long the killer must have been genuinely stopped before the walk is
// (re-)issued, and how long before it may be issued again. Without both, this
// fires on any single frame where they happen to be still — the frame after a
// spoken line calls standStill(), the frame between two waypoints — and each
// firing restarts the hop from the near side of the door. That is the pacing in
// and out of a doorway: the order was being reissued faster than the walk to
// the door could complete.
//
// It has to stay well under the gap the killer's own decisions leave. A
// marching killer re-thinks about once a second (their status is an order they
// keep acting on), and a decision holds `thinking` for as long as the API call
// takes — so the quiet window between two of their turns is about a second. At
// 1.2 the threshold was longer than the window it was waiting for and the walk
// was never issued at all: the killer stood wherever they turned, forever.
const IDLE_BEFORE_FETCH_S = 0.3;
const FETCH_REISSUE_S = 5;
let fetchIdle = 0;
let fetchCooldown = 0;

function fetchTheKnife(world: Humanoid[], dt: number) {
  const killer = world.find(isKiller);
  // a killer mid-spree who has put the blade down goes back for it too
  if (
    !killer ||
    killer.dead ||
    killer.carrying.some((item) => item.name === "Knife")
  ) {
    fetchIdle = 0;
    fetchCooldown = 0;
    return;
  }
  fetchCooldown = Math.max(0, fetchCooldown - dt);
  // don't cut across an order they're already carrying out, or a decision or
  // line still in flight.
  //
  // Deliberately NOT gated on the room being frozen. A room freezes whenever
  // anyone in it is thinking or has a line queued — and lines are queued
  // building-wide and played one at a time, so an occupied room is frozen most
  // of the time. Waiting for it to clear meant the order was never issued.
  // Issuing it into a frozen room is harmless: the freeze already stops
  // update() from moving anyone, so the walk simply starts when the room does.
  const busy =
    killer.thinking ||
    killer.speaking ||
    killer.action !== null ||
    killer.isMoving() ||
    killer.pendingUse !== null;
  // a queued blow is deliberately not in that list: an unarmed killer chasing
  // someone down to punch them is a killer who needs the knife back first, and
  // both orders below drop the pursuit as they're issued
  if (busy) {
    fetchIdle = 0;
    return;
  }
  fetchIdle += dt;
  if (fetchIdle < IDLE_BEFORE_FETCH_S || fetchCooldown > 0) return;
  fetchIdle = 0;
  fetchCooldown = FETCH_REISSUE_S;

  const knifeRoom = ROOMS.find((room) =>
    room.interactables.some(
      (thing) => thing instanceof Item && thing.name === "Knife",
    ),
  );
  if (!knifeRoom) return; // in someone's hands; makeKiller already made them drop it

  const here = roomOf(killer.x, killer.y);
  if (here === knifeRoom) {
    // same room: pick_up walks the last few feet and does the grab, with the
    // witnesses and the log line it would have had from a decision
    executeTool("pick_up", killer, world, { item: "Knife" });
    return;
  }
  const route = findPath(here, knifeRoom);
  const next = route?.[1] && roomByName(route[1]);
  if (next) moveToRoom(killer, world, { room: next.name }, true);
}

let last = performance.now();
let frameFaults = 0;

// The loop must re-arm itself no matter what happened inside it. With the
// requestAnimationFrame call sitting at the end of the body, a single throw
// anywhere in a frame — one bad tool call, one undefined dereference — ends the
// chain and the whole game stops dead, with the cause swallowed and nothing on
// screen to say so. Now the frame is scheduled regardless and the error is
// printed, so a fault costs one frame instead of the session.
function frame(wallNow: number) {
  try {
    step(wallNow);
  } catch (error) {
    frameFaults++;
    if (frameFaults <= 5) console.error("[frame] dropped a frame:", error);
    if (frameFaults === 5) console.error("[frame] further faults suppressed");
  }
  requestAnimationFrame(frame);
}

function step(wallNow: number) {
  // the sim's dt is capped so a stalled frame can't teleport anyone through a
  // wall; the anger clock wants the real elapsed time instead, or a throttled
  // background tab (rAF drops to ~1Hz) would run the pacing 20x slow
  const elapsed = (wallNow - last) / 1000;
  const dt = Math.min(elapsed, 0.05);
  last = wallNow;
  // the simmer runs on real seconds and through cutscenes: the target is four
  // minutes from the moment the page opens, and the opening credits are half a
  // minute the player sits through like any other
  if (!paused) driftAnger(humanoids, elapsed);
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
      // Presentation stands still in rooms with a thinking, speaking, or
      // freshly-emoting humanoid. TTS alone does not hold decision clocks:
      // model calls and tool commands continue behind the audience-facing shot.
      const frozen = frozenRooms(humanoids);
      const decisionBlocked = decisionBlockedRooms(humanoids);
      for (const humanoid of humanoids) {
        if (humanoid.escaped) continue;
        const room = roomOf(humanoid.x, humanoid.y);
        // The killer is never held by presentation. A room freezes while
        // anyone in it is thinking or has a line queued — and lines queue
        // building-wide and play one at a time, so a killer standing beside a
        // talkative pair never gets a frame to walk in, and the run stalls
        // with them rooted to the spot. Their plot outranks the shot; everyone
        // else still holds, so the scene itself still reads as a held frame.
        const exempt = isKiller(humanoid);
        if (decisionBlocked.has(room) && !exempt) {
          // Stateful scenes still hold their personal decision schedules.
          humanoid.nextThinkAt += dt * 1000;
          humanoid.nextMemoryAt += dt * 1000;
        }
        // a frozen room runs in slow motion rather than stopping dead — but
        // not for the killer, who moves at full speed through anyone else's
        // held shot
        humanoid.update(
          frozen.has(room) && !exempt ? dt * 0.25 : dt,
          now,
          humanoids,
        );
      }
      // after everyone has moved, ease apart anyone who still ended up
      // sharing a spot — including people whose room is frozen, since that is
      // a correction of where they already are, not travel
      separateBodies(humanoids);
      fetchTheKnife(humanoids, dt);
      scheduleThinking(humanoids, now);
      for (const humanoid of humanoids)
        maybeUpdateMemory(humanoid, now, humanoids);
    }
    // wall-time: the camera glides even while rooms are frozen
    updateCamera(dt);
  }
  draw(wallNow);
}

window.addEventListener("resize", resize);
resize();
requestAnimationFrame(frame);
