import {
  doorApproach,
  doorBetween,
  doorThrough,
  findPath,
  nearDoor,
  roomByName,
  roomOf,
  ROOMS,
  wrapText,
} from "./locations";
import type { Item } from "./interactables/types";
import { logAction, logEmote, logQuietAction } from "./log";
import {
  camera,
  focusCamera,
  focusCameraOnSpeaker,
  isCameraAutoFollowing,
} from "./camera";
import { queueBeat, speak } from "./tts";
import { isCutscenePlaying, playCutscene, type Shot } from "./cutscene";
import { playSfx } from "./sfx";
import { requestSubtitle } from "./subtitles";
import {
  claimRevealShots,
  reportKill,
  revealAvailable,
  REVEAL_TOTAL_MS as VOTE_REVEAL_MS,
} from "./voting";
import { simNow } from "./time";
import { PALETTE, silhouette, mulberry32, hashSeed } from "./theme";
import type {
  Character,
  CharacterSprites,
  SpriteSheet,
} from "./characters/types";
import { whitecatSprites } from "./characters/whitecat";
import type { SpeechEmotion } from "./speechEmotion";
import { SPEECH_LANGUAGE_NAMES, type SpeechLanguage } from "./speechLanguage";
import { spriteFor, spriteReady } from "./sprites";
import { feelSpeech, nameColor, rollTemper } from "./anger";
import type { Status } from "./statuses/types";
import { activateEscapeRoute } from "./escapeRoute";

export const UNITS_PER_FOOT = 10;

// distances shown to the agents are in feet (10 world units = 1 foot)
export function formatFeet(units: number): string {
  const feet = Math.round(units / UNITS_PER_FOOT);
  if (feet < 1) return "less than a foot";
  return `${feet} ${feet === 1 ? "foot" : "feet"}`;
}

export const TOUCH_RANGE = 20;
export const PUNCH_DAMAGE = 20;
export const STAB_DAMAGE = 100;
export const PUSH_DISTANCE = 16;

export type StrikeVerb = { present: string; past: string };

export const BODY_PARTS = [
  "head",
  "torso",
  "left arm",
  "right arm",
  "left leg",
  "right leg",
] as const;
export type BodyPart = (typeof BODY_PARTS)[number];

const WALK_SPEED = 24;
const RUN_MULTIPLIER = 2;
const STAMINA_DRAIN = 4; // per second of walking; running doubles it
const STAMINA_REGEN = 6; // per second while not moving
const BODY_HEAL_RATE = 0.3; // per second — much slower than stamina regen
const HOP_DURATION = 0.3;
const HOP_HEIGHT = 5;
const HOP_MAX_TILT = 0.3;
const ARRIVE_DISTANCE = 2;
const FOLLOW_DISTANCE = 20;
const PERSONAL_SPACE = 14; // a destination this close to someone standing there is taken
// how close two bodies may get before they're pushed apart. Kept under
// TOUCH_RANGE so a fighter can still reach the person they're shoving past.
const BODY_RADIUS = 7;
const SEPARATION = BODY_RADIUS * 2;
// how much of an overlap is corrected per frame — under 1 so the correction
// eases out instead of snapping, which reads as a shove rather than a teleport
const SEPARATION_RESPONSE = 0.35;
// a walker starts leaning around anyone inside this radius, so bodies part
// before they touch instead of grinding through each other
const AVOID_RADIUS = 26;
const AVOID_STRENGTH = 1.1;
// collision switches off this close to a doorway: two people meeting in the
// gap squeeze past each other, where pushing apart would wedge both against
// the walls and deadlock the door forever
const DOOR_CLEARANCE = 34;
const MEMORY_LIMIT = 16;
const UNCONSOLIDATED_LIMIT = 40;
const HEARD_REACTION_MS = 1500;
// how long an *action* bubble holds its slot on screen, like a spoken line
const EMOTE_MS_BASE = 1800;
const EMOTE_MS_PER_CHAR = 50;
// how long a walker must actually stand still before the idle (front) row
// takes over — waypoint handoffs (e.g. doorways) idle for a single frame,
// and snapping to front for that frame reads as a flicker
const IDLE_GRACE_S = 0.2;
// the pool under a corpse seeps out over a few seconds and then holds
const BLOOD_GROW_S = 4;
const BLOOD_RADIUS = 16;

const SPRITE_SIZE = 36; // world-unit footprint every sprite is drawn at

// sheet rows, in the order scripts/make_sprite_sheet.py lays them out. Front
// doubles as the idle animation: it is what plays whenever nobody is walking.
const FACINGS = ["front", "back", "left", "right"] as const;
export type Facing = (typeof FACINGS)[number];
const FACING_ROW: Record<Facing, number> = {
  front: 0,
  back: 1,
  left: 2,
  right: 3,
};

// which way a velocity points; the dominant axis wins, and down is front
function facingOf(vx: number, vy: number): Facing {
  if (Math.abs(vx) > Math.abs(vy)) return vx > 0 ? "right" : "left";
  return vy > 0 ? "front" : "back";
}

// dark clothing on a dark floor loses its edge, so every sprite gets a soft
// halo of its own shape behind it — reads as ceiling light catching the figure
const rimCache = new Map<string, HTMLCanvasElement>();

function rimFor(
  src: string,
  image: HTMLImageElement,
): HTMLCanvasElement | null {
  const cached = rimCache.get(src);
  if (cached) return cached;
  if (!image.complete || image.naturalWidth === 0) return null; // retry next frame
  const rim = silhouette(image, PALETTE.rim);
  rimCache.set(src, rim);
  return rim;
}

const RIM_OFFSETS = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
] as const;

// where the feet sit inside a cell, and where that lands relative to the
// humanoid's own origin — matched to FEET_ROW in scripts/make_sprite_sheet.py.
// Placing every sheet by its ground line is what lets cells of different sizes
// share one standing position.
const FEET_ROW = 0.94;
const FEET_OFFSET = 12;

// halo + one cell of a sheet, drawn around the humanoid's own origin
function drawRimmedSprite(
  ctx: CanvasRenderingContext2D,
  sheet: SpriteSheet,
  image: HTMLImageElement,
  facing: Facing,
  frame: number,
) {
  const sx = frame * sheet.cell;
  const sy = FACING_ROW[facing] * sheet.cell;
  const x = -sheet.size / 2;
  const y = FEET_OFFSET - FEET_ROW * sheet.size;
  const rim = rimFor(sheet.src, image);
  if (rim) {
    ctx.save();
    ctx.globalAlpha = ctx.globalAlpha * 0.32;
    for (const [dx, dy] of RIM_OFFSETS) {
      ctx.drawImage(
        rim,
        sx,
        sy,
        sheet.cell,
        sheet.cell,
        x + dx,
        y + dy,
        sheet.size,
        sheet.size,
      );
    }
    ctx.restore();
  }
  ctx.drawImage(
    image,
    sx,
    sy,
    sheet.cell,
    sheet.cell,
    x,
    y,
    sheet.size,
    sheet.size,
  );
}

// ---------------------------------------------------------------------------
// the whitecat reveal
//
// Whoever plants the knife, the audience is shown who is really holding it: the
// killer flickers into whitecat, holds that shape through the kill, and gets
// their own face back only once a puff of smoke has covered the change.
//
// The flicker is a hard swap, never a dissolve. A half-transparent second
// figure laid over the first reads as a rendering fault; a clean cut to someone
// else standing in the same spot reads as the reveal it is. And it has to
// chatter long enough to be *read* — a single frame is a dropped frame.
const REVEAL_FLICKER_MS = 1500; // whitecat comes and goes, faster and faster
const REVEAL_HOLD_MS = 700; // the blow lands with whitecat standing there
const REVEAL_FADE_MS = 300; // and dissolves back inside the smoke
const REVEAL_MS = REVEAL_FLICKER_MS + REVEAL_HOLD_MS + REVEAL_FADE_MS;
const SMOKE_AT_MS = REVEAL_FLICKER_MS + REVEAL_HOLD_MS; // puff, then the swap back
const SMOKE_MS = 900;
// how long the killer stays on screen after the reveal proper, so the smoke
// gets to thin out rather than being cut off
export const REVEAL_TOTAL_MS = SMOKE_AT_MS + SMOKE_MS;

// [start, end] of every stretch where whitecat is the one on screen. Built once:
// the blips lengthen and the gaps between them close, so the flicker accelerates
// into the hold instead of stopping dead.
const REVEAL_PULSES: [number, number][] = (() => {
  const pulses: [number, number][] = [];
  // a beat of the killer's own face first — there has to be something for the
  // first swap to be a swap *from*
  let at = 140;
  while (at < REVEAL_FLICKER_MS) {
    const u = at / REVEAL_FLICKER_MS;
    const on = 70 + 210 * u; // 70ms glimpse -> 280ms, nearly a held shot
    const off = 210 - 165 * u; // 210ms of the real face -> 45ms
    pulses.push([at, Math.min(at + on, REVEAL_FLICKER_MS)]);
    at += on + off;
  }
  return pulses;
})();

// how much of whitecat is showing t ms into a reveal: 1 is whitecat alone in
// the killer's place, 0 is the killer as themself
function revealAmount(t: number): number {
  if (t < 0 || t >= REVEAL_MS) return 0;
  if (t < REVEAL_FLICKER_MS) {
    return REVEAL_PULSES.some(([from, to]) => t >= from && t < to) ? 1 : 0;
  }
  const held = t - REVEAL_FLICKER_MS;
  if (held < REVEAL_HOLD_MS) return 1;
  return 1 - (held - REVEAL_HOLD_MS) / REVEAL_FADE_MS;
}

// the puff the killer changes back inside of, drawn around the humanoid's own
// origin. Its shape is seeded off the name so it doesn't crawl between frames.
function drawSmoke(ctx: CanvasRenderingContext2D, t: number, seed: number) {
  if (t < 0 || t >= SMOKE_MS) return;
  const life = t / SMOKE_MS;
  const random = mulberry32(seed);

  ctx.save();
  for (let i = 0; i < 11; i++) {
    const angle = random() * Math.PI * 2;
    const reach = 5 + random() * 11;
    const rise = 8 + random() * 14;
    const born = random() * 0.3; // puffs stagger out rather than blooming as one
    const grown = (life - born) / (1 - born);
    if (grown <= 0) continue;
    const eased = 1 - Math.pow(1 - grown, 2); // bursts out, then drifts
    ctx.globalAlpha = Math.min(1, (1 - grown) * 1.6);
    ctx.beginPath();
    ctx.arc(
      Math.cos(angle) * reach * eased,
      -10 + Math.sin(angle) * reach * 0.45 * eased - rise * eased,
      3 + 7 * eased,
      0,
      Math.PI * 2,
    );
    ctx.fillStyle = i % 3 === 0 ? PALETTE.smokeCore : PALETTE.smoke;
    ctx.fill();
  }
  ctx.restore();
}

// remember() an event for every living humanoid in the source's room, except
// the source themself; pass a function to vary the text per viewer
export function broadcastToRoom(
  source: Humanoid,
  world: Humanoid[],
  event: string | ((viewer: Humanoid) => string),
) {
  if (source.escaped) return;
  const room = roomOf(source.x, source.y);
  for (const other of world) {
    if (other === source || other.dead || other.escaped) continue;
    if (roomOf(other.x, other.y) !== room) continue;
    other.remember(typeof event === "function" ? event(other) : event);
  }
}

// Rooms whose audience-facing presentation currently stands still: any room
// holding a humanoid who is mid-decision, featured in the speech/action queue,
// whose emote the camera hasn't witnessed yet, or who is mid-swing — or
// mid-collapse, which is the one thing the dead can still hold a room for.
export function frozenRooms(world: Humanoid[]) {
  const rooms = new Set<ReturnType<typeof roomOf>>();
  for (const humanoid of world) {
    if (humanoid.escaped) continue;
    if (humanoid.dead && !isPlayingAction(humanoid)) continue;
    if (
      humanoid.thinking ||
      humanoid.speaking ||
      humanoid.emoteHold ||
      isPlayingAction(humanoid)
    ) {
      rooms.add(roomOf(humanoid.x, humanoid.y));
    }
  }
  return rooms;
}

// Presentation can hold a room on a spoken shot without holding up the plot.
// Decisions and their tool calls continue behind TTS; genuinely stateful
// scenes (thinking, emotes, attacks, and speech-warp requests) remain ordered.
export function decisionBlockedRooms(world: Humanoid[]) {
  const rooms = new Set<ReturnType<typeof roomOf>>();
  for (const humanoid of world) {
    if (humanoid.escaped) continue;
    if (humanoid.dead && !isPlayingAction(humanoid)) continue;
    if (
      humanoid.thinking ||
      humanoid.blocksPlotForPresentation ||
      humanoid.emoteHold ||
      isPlayingAction(humanoid)
    ) {
      rooms.add(roomOf(humanoid.x, humanoid.y));
    }
  }
  return rooms;
}

// an emote is a beat the viewer should witness: the actor's room stays frozen
// until the camera has watched them for a moment. Ticks on wall time (the
// camera glides on wall time too), capped so a shot that never arrives — an
// overwritten cut, a camera parked elsewhere — can't freeze the room forever
const EMOTE_SEEN_SECONDS = 0.5;
const EMOTE_HOLD_MAX_SECONDS = 5;
const EMOTE_SEEN_DISTANCE = 40; // camera center this close = the actor is framed

// how long a one-shot runs end to end
function actionDuration(humanoid: Humanoid): number {
  const action = humanoid.action!;
  const sheet = humanoid.character.sprite[action.kind];
  const base = sheet.frames * sheet.frameMs;
  // a swing that is being revealed holds its last pose — blade planted — until
  // whitecat has come and gone. The room is frozen for as long as a one-shot
  // runs, so this is also what keeps the reveal watched instead of glimpsed.
  if (action.kind === "stab" && humanoid.reveal)
    return Math.max(base, REVEAL_MS);
  return base;
}

// one-shots tick on wall time: their own room is frozen while they play, so a
// sim-time clock would never advance and the animation would never end. The
// dead keep their last frame — that collapsed body *is* the corpse.
export function updateActions(world: Humanoid[], dt: number) {
  for (const humanoid of world) {
    if (humanoid.escaped) continue;
    // the blood seeps on wall time too: the room a death happens in is frozen
    // for the reaction, and a sim clock would leave the floor clean through it
    if (humanoid.dead) humanoid.deadFor += dt;
    // the reveal outlives the swing (the smoke thins out after the room has
    // resumed), so it runs on its own clock rather than the action's
    if (humanoid.reveal) {
      humanoid.reveal.t += dt * 1000;
      if (humanoid.reveal.t >= REVEAL_TOTAL_MS) humanoid.reveal = null;
    }
    if (!humanoid.action) continue;
    humanoid.action.t += dt * 1000;
    if (humanoid.action.t >= actionDuration(humanoid) && !humanoid.dead) {
      humanoid.action = null;
    }
  }
}

// how long the room stays frozen and the camera stays tight for a stab: long
// enough for the swing, and long enough for the reveal riding on it — right
// through the puff of smoke that hands the killer their own face back
function stabSceneMs(killer: Humanoid): number {
  const stab = killer.character.sprite.stab;
  return Math.max(stab.frames * stab.frameMs + 800, REVEAL_MS + 500);
}

// true when a point is inside some room's floor, rather than in a wall or
// outside the building. roomOf can't answer this — it falls back to the
// nearest room for points that are in neither.
function onFloor(x: number, y: number): boolean {
  return ROOMS.some(
    (room) =>
      x >= room.x &&
      x <= room.x + room.w &&
      y >= room.y &&
      y <= room.y + room.h,
  );
}

// steering stops bodies from walking into each other; this is the backstop for
// when they end up sharing a spot anyway — someone spawning on a neighbour, or
// a corridor too narrow to lean out of. Each overlapping pair is eased apart
// along the line between them.
export function separateBodies(world: Humanoid[]) {
  for (let i = 0; i < world.length; i++) {
    for (let j = i + 1; j < world.length; j++) {
      const a = world[i]!;
      const b = world[j]!;
      // the dead have no collision at all: the living step over a body, so
      // a corpse dropped in a doorway can never wall the door off
      if (a.dead || b.dead || a.escaped || b.escaped) continue;
      // doorways are collision-free too — see DOOR_CLEARANCE
      if (
        nearDoor(a.x, a.y, DOOR_CLEARANCE) ||
        nearDoor(b.x, b.y, DOOR_CLEARANCE)
      ) {
        continue;
      }
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let distance = Math.hypot(dx, dy);
      if (distance >= SEPARATION) continue;
      if (distance < 0.001) {
        // exactly stacked, so there's no line to push along: pick one off the
        // pair's position in the world list, which is stable frame to frame
        const angle = ((i * 7 + j) % 16) * (Math.PI / 8);
        dx = Math.cos(angle);
        dy = Math.sin(angle);
        distance = 0.001;
      }
      const nudge = ((SEPARATION - distance) / distance) * SEPARATION_RESPONSE;
      // a push that would put someone in a wall is dropped rather than
      // clamped — better to briefly overlap than to stand inside the masonry
      const ax = a.x - dx * nudge * 0.5;
      const ay = a.y - dy * nudge * 0.5;
      if (onFloor(ax, ay)) {
        a.x = ax;
        a.y = ay;
      }
      const bx = b.x + dx * nudge * 0.5;
      const by = b.y + dy * nudge * 0.5;
      if (onFloor(bx, by)) {
        b.x = bx;
        b.y = by;
      }
    }
  }
}

// true while a one-shot still has frames to show — the room waits for it
export function isPlayingAction(humanoid: Humanoid): boolean {
  return (
    humanoid.action !== null && humanoid.action.t < actionDuration(humanoid)
  );
}

export function updateEmoteHolds(world: Humanoid[], dt: number) {
  for (const humanoid of world) {
    if (humanoid.escaped) continue;
    const hold = humanoid.emoteHold;
    if (!hold) continue;
    hold.heldFor += dt;
    // with the camera in manual mode there is no shot to wait for — the hold
    // just runs its second so the beat still registers before the room resumes
    const framed =
      !isCameraAutoFollowing() ||
      Math.hypot(camera.x - humanoid.x, camera.y - humanoid.y) <
        EMOTE_SEEN_DISTANCE;
    if (framed) hold.seenFor += dt;
    if (
      hold.seenFor >= EMOTE_SEEN_SECONDS ||
      hold.heldFor >= EMOTE_HOLD_MAX_SECONDS
    ) {
      humanoid.emoteHold = null;
      humanoid.emote = null; // the bubble leaves together with the shot
    }
  }
}

// speech filters contributed by statuses (e.g. Divine Madness): the first
// status offering a warp wins. Outgoing rewrites what the world hears when
// this humanoid speaks; incoming rewrites what this humanoid hears
function outgoingSpeechWarp(
  speaker: Humanoid,
): ((text: string) => Promise<string>) | null {
  return null;
}

function incomingSpeechWarp(
  hearer: Humanoid,
): ((text: string, speaker: string) => Promise<string>) | null {
  return null;
}

// where to actually stop when walking to a point someone is already standing
// on: the first spot on a ring of nearby points that is open and still inside
// the same room — or the original point when it's free or everywhere nearby
// is just as crowded
function openSpotNear(
  spot: { x: number; y: number },
  self: Humanoid,
  world: Humanoid[],
): { x: number; y: number } {
  // moving humanoids don't claim a spot — they're about to vacate it
  const taken = (x: number, y: number) =>
    world.some(
      (other) =>
        other !== self &&
        !other.escaped &&
        !other.isMoving() &&
        Math.hypot(other.x - x, other.y - y) < PERSONAL_SPACE,
    );
  if (!taken(spot.x, spot.y)) return spot;
  const room = roomOf(spot.x, spot.y);
  for (let radius = 20; radius <= 60; radius += 20) {
    for (let step = 0; step < 8; step++) {
      const angle = (step / 8) * Math.PI * 2;
      const x = spot.x + Math.cos(angle) * radius;
      const y = spot.y + Math.sin(angle) * radius;
      // containment check, not roomOf — its nearest-room fallback would
      // accept points outside the house; 12 matches doorLanding's wall margin
      const inRoom =
        x >= room.x + 12 &&
        x <= room.x + room.w - 12 &&
        y >= room.y + 12 &&
        y <= room.y + room.h - 12;
      if (inRoom && !taken(x, y)) return { x, y };
    }
  }
  return spot;
}

export class Humanoid {
  character: Character;

  x: number;
  y: number;
  vx = 0;
  vy = 0;
  hopT = 0; // 0 = grounded, (0,1) = mid-hop arc
  hopTilt = 0;
  facing: Facing = "front"; // which row of the walk sheet is playing
  animT = 0; // ms into the walk cycle; runs on sim time, so it stops when a room freezes
  stillFor = IDLE_GRACE_S; // seconds since the last movement, for the idle fallback
  // a one-shot playing over the walk loop: swinging a blade, or going down
  // under one. It runs on wall time (see updateActions) because the room it
  // happens in is frozen for exactly as long as it lasts.
  action: { kind: "stab" | "stabbed"; facing: Facing; t: number } | null = null;
  // set while this humanoid is being shown as whitecat; see the reveal above
  reveal: { t: number } | null = null;

  statuses = new Map<string, Status>();

  body: Record<BodyPart, number> = {
    head: 100,
    torso: 100,
    "left arm": 100,
    "right arm": 100,
    "left leg": 100,
    "right leg": 100,
  };
  stamina = 100;
  dead = false;
  escaped = false;
  deadFor = 0; // seconds since dying — drives how far the blood has spread
  running = false;
  carrying: Item[] = [];

  target: { x: number; y: number } | null = null;
  pendingPath: { x: number; y: number }[] = []; // waypoints after the current target
  followName: string | null = null;
  // a blow queued from too far away: the pursuit is a follow, and update()
  // lands the strike the moment the target is within arm's reach
  pendingStrike: {
    target: string;
    part: BodyPart;
    damage: number;
    verb: StrikeVerb;
  } | null = null;
  // an interaction queued from too far away (e.g. playing an arcade cabinet):
  // update() runs the act the moment the spot is within arm's reach
  pendingUse: { x: number; y: number; act: () => void } | null = null;
  speech: {
    text: string;
    until: number;
    language: SpeechLanguage;
    addressing: string;
  } | null = null;
  emote: { text: string } | null = null; // *action* bubble, lives as long as its hold
  // freezes the room until the camera has watched the emote (wall-time seconds)
  emoteHold: { seenFor: number; heldFor: number } | null = null;
  memory: string[] = [];
  longMemory = "";
  unconsolidated: string[] = []; // events not yet folded into longMemory

  // 0..100, continuous; see src/anger.ts for what moves it and what it costs
  // to cross MURDEROUS_AT. Nothing draws it.
  anger = 0;
  // what the constant drift alone has reached; anger is never let below it, so
  // the pacing target holds no matter how pleasant the conversation gets
  angerFloor = 0;
  // this one's share of the ambient drift, rolled at spawn: without it every
  // gauge rises in lockstep and who snaps first is just array order
  temper = rollTemper();
  // real seconds spent carrying murderous intent without a body to show for it
  killerFor = 0;
  hasKilled = false;
  // has swung the blade at someone, whether or not it has landed yet. From
  // this moment the role is theirs for good — see driftAnger.
  killCommitted = false;
  // how much of that anger each other person is responsible for, by name —
  // it's what picks the target once someone turns
  grudge = new Map<string, number>();

  thinking = false;
  speaking = false; // something featuring them is queued or playing
  blocksPlotForPresentation = false;
  private presentationHolds = 0;
  private plotBlockingPresentationHolds = 0;
  nextThinkAt: number;
  consolidating = false;
  nextMemoryAt = 0;
  roomName: string | null = null; // room as of the previous update, for transition detection

  constructor(character: Character, x: number, y: number) {
    this.character = character;
    this.longMemory = character.initialMemory;
    this.x = x;
    this.y = y;
    // stagger first decisions so 20 agents don't all call the API at once
    this.nextThinkAt = simNow() + Math.random() * 10000;

    this.character.onInit?.(this);
  }

  private holdPresentation(blocksPlot: boolean) {
    this.presentationHolds++;
    if (blocksPlot) this.plotBlockingPresentationHolds++;
    this.speaking = true;
    this.blocksPlotForPresentation = this.plotBlockingPresentationHolds > 0;
  }

  private releasePresentation(blocksPlot: boolean) {
    this.presentationHolds = Math.max(0, this.presentationHolds - 1);
    if (blocksPlot) {
      this.plotBlockingPresentationHolds = Math.max(
        0,
        this.plotBlockingPresentationHolds - 1,
      );
    }
    this.speaking = this.presentationHolds > 0;
    this.blocksPlotForPresentation = this.plotBlockingPresentationHolds > 0;
  }

  isMoving(): boolean {
    return this.vx !== 0 || this.vy !== 0 || this.pendingPath.length > 0;
  }

  // a small *action* bubble over the head for non-speech, non-movement acts;
  // like talking it freezes the room, and both the freeze and the bubble last
  // until the camera has seen the act
  showEmote(text: string) {
    // the bubble displays *text*, and the subtitle keys on the display form;
    // the beat waits on the translation so bubble and subtitle land together
    const subtitled = requestSubtitle(
      this.character.name,
      roomOf(this.x, this.y).name,
      `*${text}*`,
    );
    // actions share the spoken-line queue: they hold the screen one at a
    // time, so an action in one room can't talk over dialogue in another
    const beat = queueBeat(EMOTE_MS_BASE + text.length * EMOTE_MS_PER_CHAR, {
      waitFor: subtitled,
      onStart: () => {
        if (this.dead || this.escaped) return;
        this.emote = { text };
        // an action is a shot of its own: cut to it like a spoken line
        focusCameraOnSpeaker(this);
      },
      onEnd: () => {
        this.releasePresentation(true);
        if (this.emote?.text === text) this.emote = null;
      },
    });
    if (beat) {
      // freezes the room from decision to bubble-end, exactly like speech
      this.holdPresentation(true);
      return;
    }
    // queue full: the old instant bubble, held until the camera has seen it
    this.emote = { text };
    this.emoteHold = { seenFor: 0, heldFor: 0 };
  }

  // both legs at 100% -> 1, one dead leg -> 0.5, both dead -> 0
  legSpeedFactor(): number {
    return (this.body["left leg"] + this.body["right leg"]) / 200;
  }

  // bend the current heading away from anyone standing in the way, keeping the
  // speed intact so a detour costs time rather than pace. Whoever is closest
  // decides the side to pass on, so two people meeting head-on don't mirror
  // each other into a deadlock.
  private steerAroundOthers(
    world: Humanoid[],
    speed: number,
    toDestination: number,
  ) {
    // on the last stride the destination wins: veering here would have them
    // circling the spot they came to stand on
    if (toDestination <= AVOID_RADIUS * 0.5) return;
    // inside a doorway's clearance nobody steers — drive straight through the
    // gap; veering around someone here wedges both against the walls
    if (nearDoor(this.x, this.y, DOOR_CLEARANCE)) return;
    const headingX = this.vx / speed;
    const headingY = this.vy / speed;
    let steerX = 0;
    let steerY = 0;
    for (const other of world) {
      if (other === this) continue;
      // the dead have no collision — walkers step over a body, not around it
      if (other.dead || other.escaped) continue;
      // someone already in a doorway isn't an obstacle: they're mid-squeeze
      if (nearDoor(other.x, other.y, DOOR_CLEARANCE)) continue;
      // the one they're closing on isn't an obstacle — it's the point. Veering
      // off them would have the follower orbit their heels, and the attacker
      // circle the person they mean to hit.
      if (other.character.name === this.pendingStrike?.target) continue;
      if (other.character.name === this.followName) continue;
      const dx = other.x - this.x;
      const dy = other.y - this.y;
      const distance = Math.hypot(dx, dy);
      if (distance >= AVOID_RADIUS || distance < 0.001) continue;
      // only what's ahead is in the way; anyone behind or abreast is passed
      const ahead = (dx * headingX + dy * headingY) / distance;
      if (ahead <= 0.2) continue;
      // sidestep perpendicular to the heading, away from the side they're on
      const cross = headingX * dy - headingY * dx;
      const side = cross >= 0 ? -1 : 1;
      const urgency = (1 - distance / AVOID_RADIUS) * ahead;
      steerX += -headingY * side * urgency;
      steerY += headingX * side * urgency;
    }
    if (steerX === 0 && steerY === 0) return;
    const blendX = headingX + steerX * AVOID_STRENGTH;
    const blendY = headingY + steerY * AVOID_STRENGTH;
    const length = Math.hypot(blendX, blendY);
    if (length < 0.001) return;
    this.vx = (blendX / length) * speed;
    this.vy = (blendY / length) * speed;
  }

  say(
    text: string,
    spokenText: string,
    world: Humanoid[],
    now: number,
    verb: "say" | "yell",
    language: SpeechLanguage,
    addressing: string,
    delivery?: string, // stage direction for the voice, passed to transcription
    emotion: SpeechEmotion = "neutral",
    hostility?: string, // how the line was meant; feeds the anger gauge
  ) {
    if (this.escaped) return;
    // trim quotes if fully wrapped (avoids trimming text that starts of ends with quoted text)
    if (text.startsWith('"') && text.endsWith('"'))
      text = text.substring(1, text.length - 1);
    if (spokenText.startsWith('"') && spokenText.endsWith('"'))
      spokenText = spokenText.substring(1, spokenText.length - 1);

    // talking roots you in place: any walk or follow in progress is dropped
    this.standStill();
    // the speaker remembers what they meant to say, even when a status warps
    // what actually leaves their mouth
    this.remember(
      `You ${verb === "yell" ? "yelled" : "said"}${addressing === "everyone in the room" ? "" : ` to ${addressing}`} in ${SPEECH_LANGUAGE_NAMES[language]}: "${text}"`,
    );

    const warp = outgoingSpeechWarp(this);
    if (!warp) {
      this.deliverLine(
        text,
        spokenText,
        world,
        now,
        verb,
        language,
        addressing,
        delivery,
        emotion,
        hostility,
      );
      return;
    }
    // hold the room frozen while the line is being warped, exactly like a
    // queued voice line; delivery re-arms the flag when it lands
    this.holdPresentation(true);
    warp(text)
      .catch(() => text)
      .then((warped) => {
        this.releasePresentation(true);
        if (this.dead || this.escaped) return;
        this.deliverLine(
          warped,
          warped === text ? spokenText : warped,
          world,
          simNow(),
          verb,
          language,
          addressing,
          delivery,
          emotion,
          hostility,
        );
      });
  }

  // the world-facing half of speaking: bubble, voice, log, and what everyone
  // in earshot hears (each hearer's own statuses may warp it once more)
  private deliverLine(
    text: string,
    spokenText: string,
    world: Humanoid[],
    now: number,
    verb: "say" | "yell",
    language: SpeechLanguage,
    addressing: string,
    delivery?: string,
    emotion: SpeechEmotion = "neutral",
    hostility?: string,
  ) {
    // the line's slot in the queue waits on the translation, so the voice
    // never starts before its subtitle is ready
    const subtitled = requestSubtitle(
      this.character.name,
      roomOf(this.x, this.y).name,
      text,
      language,
    );
    // the bubble tracks the voice: it appears when the line starts playing
    // and clears when it finishes, not on a sim-time timer
    const spoken = speak(spokenText, {
      speaker: this.character.name,
      voice: this.character.voice,
      delivery,
      emotion,
      language,
      waitFor: subtitled,
      volume: verb === "yell" ? 1 : 0.7,
      onStart: () => {
        if (this.dead || this.escaped) return;
        this.speech = {
          text,
          until: Number.POSITIVE_INFINITY,
          language,
          addressing,
        };
        // the camera cuts when the line becomes audible, not when it was
        // queued: with lines queued from different rooms, play order —
        // not decision order — picks who is on screen
        focusCameraOnSpeaker(this);
      },
      onEnd: () => {
        if (this.speech && this.speech.text === text) this.speech = null;
        this.releasePresentation(false);
      },
    });
    // TTS holds only the audience-facing shot. Agent decisions and tool calls
    // continue in the background while the serialized voice line plays.
    if (spoken) this.holdPresentation(false);
    // no TTS (unsupported browser or full queue): fall back to a timed bubble,
    // and focus now since there is no utterance start to cut on
    if (!spoken) {
      this.speech = {
        text,
        until: now + 4000 + text.length * 60,
        language,
        addressing,
      };
      focusCamera([this]);
    }
    logQuietAction(
      `${this.character.name} ${verb === "yell" ? "yells" : "says"}${addressing === "everyone in the room" ? "" : ` to ${addressing}`} in ${SPEECH_LANGUAGE_NAMES[language]}: "${text}"`,
      this,
    );
    // walls scope sound: talking reaches your room, yelling also reaches adjacent rooms
    const myRoom = roomOf(this.x, this.y);
    const heardBy: Humanoid[] = [];
    for (const other of world) {
      if (other === this || other.dead || other.escaped) continue;
      const otherRoom = roomOf(other.x, other.y);
      const sameRoom = otherRoom === myRoom;
      const adjacent = myRoom.doors.includes(otherRoom.name);
      if (!sameRoom && !(verb === "yell" && adjacent)) continue;
      heardBy.push(other);
      const compose = (heard: string) =>
        sameRoom
          ? `You heard ${this.character.name} ${verb}${addressing === "everyone in the room" ? "" : ` to ${addressing}`} in ${SPEECH_LANGUAGE_NAMES[language]}: "${heard}"`
          : `You heard ${this.character.name} yell in ${SPEECH_LANGUAGE_NAMES[language]} from ${myRoom.promptName}: "${heard}"`;
      const hearWarp = incomingSpeechWarp(other);
      if (hearWarp) {
        // the hearer's own filter rewrites the line before it lands in memory
        hearWarp(text, this.character.name)
          .catch(() => text)
          .then((heard) => {
            if (!other.dead && !other.escaped) other.remember(compose(heard));
          });
      } else {
        other.remember(compose(text));
      }
      other.nextThinkAt = Math.min(
        other.nextThinkAt,
        now + HEARD_REACTION_MS + Math.random() * 2000,
      );
    }
    // the same set the line actually reached — a barbed remark can't needle
    // someone through a wall it never carried through
    if (hostility) feelSpeech(this, heardBy, hostility, verb, world);
  }

  // waypoint path into another room: line up in front of the door, pass
  // through it, then land inside
  goToRoom(
    path: { x: number; y: number }[],
    roomPromptName: string,
    world: Humanoid[],
    running = false,
  ) {
    const [first, ...rest] = path;
    if (!first) return;
    this.target = first;
    this.pendingPath = rest;
    this.followName = null;
    this.pendingStrike = null; // a new order drops any queued blow
    this.pendingUse = null;
    this.running = running;
    const gait = running ? "running" : "walking";
    this.remember(`You started ${gait} to ${roomPromptName}.`);
    this.announceDeparture(world, `start ${gait} toward ${roomPromptName}`);
  }

  followHumanoid(name: string, world: Humanoid[], running = false) {
    this.followName = name;
    this.target = null;
    this.pendingPath = [];
    this.pendingStrike = null; // a new order drops any queued blow
    this.pendingUse = null;
    this.running = running;
    const gait = running ? "running" : "walking";
    this.remember(`You started ${gait} toward ${name}.`);
    this.announceDeparture(world, `start ${gait} toward`, name);
  }

  // setting off is visible: everyone in the room sees where you're headed
  private announceDeparture(
    world: Humanoid[],
    action: string,
    targetName?: string,
  ) {
    broadcastToRoom(this, world, (viewer) => {
      const suffix =
        targetName === undefined
          ? ""
          : targetName === viewer.character.name
            ? " you"
            : ` ${targetName}`;
      return `You saw ${this.character.name} ${action}${suffix}.`;
    });
  }

  standStill() {
    if (this.target || this.followName) this.remember("You stopped walking.");
    this.target = null;
    this.pendingPath = [];
    this.followName = null;
    this.pendingStrike = null; // dropping the pursuit drops the queued blow
    this.pendingUse = null;
    this.running = false;
  }

  remember(event: string) {
    if (this.escaped) return;
    this.memory.push(event);
    if (this.memory.length > MEMORY_LIMIT) this.memory.shift();
    this.unconsolidated.push(event);
    if (this.unconsolidated.length > UNCONSOLIDATED_LIMIT)
      this.unconsolidated.shift();
  }

  // the moment a blow connects: witnesses see it, damage lands, both parties
  // remember (witnesses first, so a possible death broadcast lands after the
  // strike in their memory)
  landStrike(
    target: Humanoid,
    part: BodyPart,
    damage: number,
    verb: StrikeVerb,
    world: Humanoid[],
    now: number,
    immediate = false,
  ) {
    const strike = () => {
      if (this.dead || this.escaped) return;
      if (target.dead || target.escaped) {
        this.remember(
          `You went to ${verb.present.replace(/e?s$/, "")} ${target.character.name}, but they are already dead.`,
        );
        return;
      }
      const at = simNow();
      const room = roomOf(target.x, target.y);
      for (const witness of world) {
        if (
          witness === this ||
          witness === target ||
          witness.dead ||
          witness.escaped
        )
          continue;
        if (roomOf(witness.x, witness.y) !== room) continue;
        witness.remember(
          `You saw ${this.character.name} ${verb.past} ${target.character.name}'s ${part}!`,
        );
        witness.nextThinkAt = Math.min(witness.nextThinkAt, at + 500);
      }

      // both fighters turn to face each other for the exchange. Punches have
      // no art of their own, so they borrow the blade's swing.
      // only the blade earns the reveal — a punch borrows the animation, not
      // the accusation. Set first: it is what lengthens the swing.
      if (verb.present === "stabs") this.reveal = { t: 0 };
      this.playAction("stab", facingOf(target.x - this.x, target.y - this.y));
      target.facing = facingOf(this.x - target.x, this.y - target.y);

      target.takeDamage(part, damage, world, at, this);
      // the intent is spent the moment it lands: no grace timer to run out, and
      // nobody else takes the role afterwards
      if (target.dead) this.hasKilled = true;
      this.remember(`You ${verb.past} ${target.character.name}'s ${part}.`);
      if (!target.dead) {
        target.remember(`${this.character.name} ${verb.past} your ${part}!`);
        target.nextThinkAt = Math.min(target.nextThinkAt, at + 500);
      }
      // logEmote(
      //   `${this.character.name} ${verb.present} ${target.character.name}'s ${part}`,
      //   this,
      //   target,
      // );

      // a stab is a scene: every room freezes and the camera cuts in tight
      // under letterbox while the swing plays out. No fade from black — the
      // blow is the cut.
      if (verb.present === "stabs") {
        playSfx("stab"); // the blow itself, on the frame it lands
        const shots: Shot[] = [
          {
            x: (this.x + target.x) / 2,
            y: (this.y + target.y) / 2 - 10,
            zoomFrom: 4.5,
            zoomTo: 6,
            duration: stabSceneMs(this) / 1000,
            // only a lethal blow earns the long sting — a survivable stab
            // gets the impact and nothing more
            sfx: target.dead ? "kill" : undefined,
          },
        ];
        // if (target.dead) {
        //   shots.push({
        //     x: target.x,
        //     y: target.y - 10,
        //     zoomFrom: 5.5,
        //     zoomTo: 6.2,
        //     duration: 2.4,
        //   });
        // }
        // a kill folds the killer reveal into this same cutscene — one
        // continuous sequence, so the camera never pops back to the sim
        // between the blow and the reveal
        if (target.dead) {
          const reveal = claimRevealShots(this, target);
          if (reveal) shots.push(...reveal);
        }
        playCutscene(shots, { openFade: false });
      }
    };

    if (verb.present !== "stabs" || immediate) {
      strike();
      return;
    }
    // the swing is the point of no return, and it counts from here rather than
    // from where the blow lands: the scene below waits its turn in the queue,
    // and anything that could lift the intent during that wait would strip it
    // off someone who is a fraction of a second from killing.
    this.killCommitted = true;
    // the stab scene takes its turn in the same one-at-a-time queue as speech
    // and action bubbles, so it never opens over a line still playing in
    // another room; the fight's room stays frozen while it waits. A lethal
    // blow reserves extra time for the killer-reveal shots it will append.
    const willDie =
      (part === "head" || part === "torso") && target.body[part] <= damage;
    const sceneMs =
      stabSceneMs(this) + (willDie && revealAvailable() ? VOTE_REVEAL_MS : 0);
    const queued = queueBeat(sceneMs, {
      onStart: strike,
      onEnd: () => {
        this.releasePresentation(true);
      },
    });
    if (!queued) {
      strike(); // queue full: land the blow now rather than drop it
      return;
    }
    this.holdPresentation(true);
  }

  takeDamage(
    part: BodyPart,
    amount: number,
    world: Humanoid[],
    now: number,
    attacker?: Humanoid,
  ) {
    if (this.dead || this.escaped) return;
    this.body[part] = Math.max(0, this.body[part] - amount);
    if ((part === "head" || part === "torso") && this.body[part] <= 0) {
      this.die(world, now, attacker);
    }
  }

  // start a one-shot over the walk loop; it holds the room until it finishes
  playAction(kind: "stab" | "stabbed", facing: Facing) {
    this.action = { kind, facing, t: 0 };
  }

  die(world: Humanoid[], now: number, killer?: Humanoid) {
    if (this.dead || this.escaped) return;
    this.dead = true;
    // One-on-one meetings are opening-act cover traffic. Once the first body
    // drops, nobody should keep following that artificial social objective.
    for (const humanoid of world) {
      humanoid.statuses.delete("Urgent Meeting");
    }
    // The first death triggers a building-wide scream and unlocks one
    // persistent, randomly selected exterior exit. Survivors outside this room
    // learn only that something is wrong and where the route appeared; direct
    // witnesses retain the concrete strike and collapse events recorded here.
    activateEscapeRoute(world, killer);
    // any death closes audience voting; the killer-reveal shots are folded
    // into the stab cutscene itself, over in landStrike. This fallback names
    // whoever has a kill on their hands, and this humanoid as the victim.
    reportKill(
      world.find((other) => other.hasKilled)?.character.name ?? "",
      this.character.name,
    );
    // the collapse plays out and then stays put — its last frame is the corpse
    this.playAction("stabbed", this.facing);
    logAction(`${this.character.name} dies!`, this);
    this.vx = 0;
    this.vy = 0;
    this.target = null;
    this.pendingPath = [];
    this.followName = null;
    this.pendingStrike = null;
    this.pendingUse = null;
    this.speech = null;
    const myRoom = roomOf(this.x, this.y);
    // whatever they carried spills onto the body
    for (const item of this.carrying) {
      item.position = {
        x: this.x + (Math.random() - 0.5) * 12,
        y: this.y + (Math.random() - 0.5) * 12,
      };
      myRoom.interactables.push(item);
    }
    this.carrying = [];
    for (const other of world) {
      if (other === this || other.dead || other.escaped) continue;
      if (roomOf(other.x, other.y) === myRoom) {
        other.remember(`You saw ${this.character.name} collapse and die.`);
        other.nextThinkAt = Math.min(other.nextThinkAt, now + 500);
      }
    }
  }

  escape(world: Humanoid[], routeLabel: string) {
    if (this.dead || this.escaped) return;
    const room = roomOf(this.x, this.y);
    this.remember(`You escaped the building through the ${routeLabel}.`);
    for (const other of world) {
      if (other === this || other.dead || other.escaped) continue;
      const meeting = other.statuses.get("Urgent Meeting") as
        | { target?: string }
        | undefined;
      if (meeting?.target === this.character.name) {
        other.statuses.delete("Urgent Meeting");
      }
      if (roomOf(other.x, other.y) !== room) continue;
      other.remember(
        `You saw ${this.character.name} escape the building through the ${routeLabel}.`,
      );
      other.nextThinkAt = Math.min(other.nextThinkAt, simNow() + 500);
    }
    // Do not let the only weapon leave the simulation with an escaping killer.
    for (const item of [...this.carrying]) {
      if (item.name !== "Knife") continue;
      this.carrying.splice(this.carrying.indexOf(item), 1);
      item.position = { x: this.x, y: this.y };
      room.interactables.push(item);
    }
    this.statuses.delete("Murderous Intent");
    this.grudge.clear();
    this.standStill();
    this.speech = null;
    this.emote = null;
    this.emoteHold = null;
    this.escaped = true;
    logAction(`${this.character.name} escapes the building!`, this);
  }

  update(dt: number, now: number, world: Humanoid[]) {
    if (this.escaped) return;
    if (this.speech && now > this.speech.until) this.speech = null;
    if (this.dead) {
      this.vx = 0;
      this.vy = 0;
      return;
    }

    // slow healing; a part at 0% is destroyed and never recovers
    for (const part of BODY_PARTS) {
      const health = this.body[part];
      if (health > 0 && health < 100) {
        this.body[part] = Math.min(100, health + BODY_HEAL_RATE * dt);
      }
    }

    let destination: { x: number; y: number; stopDistance: number } | null =
      null;
    if (this.followName) {
      const followed = world.find(
        (other) => !other.escaped && other.character.name === this.followName,
      );
      const myRoom = roomOf(this.x, this.y);
      const followedRoom = followed ? roomOf(followed.x, followed.y) : null;
      if (!followed || !followedRoom) {
        this.followName = null;
      } else if (followedRoom === myRoom) {
        destination = {
          x: followed.x,
          y: followed.y,
          stopDistance: FOLLOW_DISTANCE,
        };
      } else {
        // pursue through doors: head for the next room along the path,
        // re-planning each frame as the followed keeps moving
        const path = findPath(myRoom, followedRoom);
        const nextRoom = path && path.length > 1 ? roomByName(path[1]!) : null;
        if (nextRoom) {
          const door = doorBetween(myRoom, nextRoom);
          const approach = doorApproach(myRoom, nextRoom);
          // line up in front of the door before passing through, so shallow
          // approach angles don't slide along the wall
          const lateral =
            approach.x === door.x
              ? Math.abs(this.x - door.x)
              : Math.abs(this.y - door.y);
          const point =
            lateral <= 10 ? doorThrough(myRoom, nextRoom) : approach;
          destination = {
            x: point.x,
            y: point.y,
            stopDistance: ARRIVE_DISTANCE,
          };
        } else {
          this.followName = null;
          this.remember(`You lost track of ${followed.character.name}.`);
          this.nextThinkAt = Math.min(this.nextThinkAt, now + 500);
        }
      }
    } else if (this.target) {
      // don't stop on top of someone standing at the destination — settle on
      // an open spot nearby, re-checked each frame in case the spot gets
      // taken mid-walk (door waypoints are exempt: those are walked through)
      //
      // A queued interaction is exempt too. Its destination is a thing on the
      // floor, not a place to stand, and the act only fires within TOUCH_RANGE
      // of it — while openSpotNear displaces by 20 units at the least, which is
      // already the whole of that reach. Someone loitering by the knife would
      // otherwise park the killer just outside it forever, with pendingUse
      // still set, which is also what stops fetchTheKnife from ever retrying.
      if (this.pendingPath.length === 0 && !this.pendingUse) {
        this.target = openSpotNear(this.target, this, world);
      }
      destination = { ...this.target, stopDistance: ARRIVE_DISTANCE };
    }

    this.vx = 0;
    this.vy = 0;
    if (destination) {
      const speed =
        WALK_SPEED *
        this.legSpeedFactor() *
        (this.running ? RUN_MULTIPLIER : 1);
      if (speed <= 0) {
        this.target = null;
        this.pendingPath = [];
        this.followName = null;
        this.remember("Your legs are too damaged to move.");
        this.nextThinkAt = Math.min(this.nextThinkAt, now + 500);
      } else {
        const dx = destination.x - this.x;
        const dy = destination.y - this.y;
        const distance = Math.hypot(dx, dy);
        if (distance > destination.stopDistance) {
          this.vx = (dx / distance) * speed;
          this.vy = (dy / distance) * speed;
          this.steerAroundOthers(world, speed, distance);
        } else if (this.target) {
          const next = this.pendingPath.shift();
          if (next) {
            this.target = next;
          } else {
            this.target = null;
            this.remember(
              `You arrived in ${roomOf(this.x, this.y).promptName}.`,
            );
            // arrived — worth deciding what to do next soon, but with enough
            // of a beat that anyone traveling a step behind gets here first
            this.nextThinkAt = Math.min(this.nextThinkAt, now + 3000);
          }
        }
      }
    }

    if (this.isMoving()) {
      const effort = this.running ? RUN_MULTIPLIER : 1;
      this.stamina = Math.max(0, this.stamina - STAMINA_DRAIN * effort * dt);
    } else {
      this.stamina = Math.min(100, this.stamina + STAMINA_REGEN * dt);
    }

    const moving = this.isMoving();
    // the walk cycle runs at the source video's tempo whether walking or idling
    // — standing still just means the front row keeps playing
    const sheet = this.character.sprite.walk;
    this.animT = (this.animT + dt * 1000) % (sheet.frames * sheet.frameMs);
    if (moving) {
      this.facing = facingOf(this.vx, this.vy);
      this.stillFor = 0;
    } else {
      this.stillFor += dt;
    }

    // advance the hop cycle while moving; if stopped mid-hop, finish the arc to land
    if (moving || this.hopT > 0) {
      if (this.hopT === 0)
        this.hopTilt = (Math.random() * 2 - 1) * HOP_MAX_TILT;
      this.hopT += dt / HOP_DURATION;
      if (this.hopT >= 1) this.hopT = 0;
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // a queued blow lands the moment its target is within arm's reach
    if (this.pendingStrike) {
      const pending = this.pendingStrike;
      const target = world.find(
        (other) => other !== this && other.character.name === pending.target,
      );
      if (!target || target.dead || target.escaped) {
        this.standStill(); // the pursuit lost its point (clears the blow too)
      } else if (
        Math.hypot(target.x - this.x, target.y - this.y) <= TOUCH_RANGE
      ) {
        // stop silently — the strike memory itself explains the halt
        this.pendingStrike = null;
        this.target = null;
        this.pendingPath = [];
        this.followName = null;
        this.running = false;
        this.landStrike(
          target,
          pending.part,
          pending.damage,
          pending.verb,
          world,
          now,
        );
      }
    }

    // a queued interaction fires the moment its spot is within arm's reach
    if (this.pendingUse) {
      const use = this.pendingUse;
      if (Math.hypot(use.x - this.x, use.y - this.y) <= TOUCH_RANGE) {
        // stop silently — the act's own memory explains the halt
        this.pendingUse = null;
        this.target = null;
        this.pendingPath = [];
        this.followName = null;
        this.running = false;
        use.act();
      }
    }

    // room transitions are witnessed: the room left behind sees where you
    // went, the room entered sees where you came from
    const room = roomOf(this.x, this.y);
    if (this.roomName === null) {
      this.roomName = room.name; // first update after spawn/load — no crossing
    } else if (room.name !== this.roomName) {
      const fromName = this.roomName;
      const fromPrompt = roomByName(fromName)?.promptName ?? fromName;
      this.roomName = room.name;
      for (const other of world) {
        if (other === this || other.dead || other.escaped) continue;
        const otherRoomName = roomOf(other.x, other.y).name;
        if (otherRoomName === fromName) {
          other.remember(
            `You saw ${this.character.name} leave ${fromPrompt} toward ${room.promptName}.`,
          );
        } else if (otherRoomName === room.name) {
          other.remember(
            `You saw ${this.character.name} enter ${room.promptName} from ${fromPrompt}.`,
          );
          // someone walking in is worth reacting to
          other.nextThinkAt = Math.min(
            other.nextThinkAt,
            now + HEARD_REACTION_MS + Math.random() * 2000,
          );
        }
      }
    }

    for (const status of this.statuses.values()) {
      status.update(dt, now, world);
    }
  }

  // which sheet, row and column to show right now: a one-shot wins while it
  // plays, otherwise the walk loop — whose front row doubles as the idle
  private pose(): {
    kind: keyof CharacterSprites;
    sheet: SpriteSheet;
    facing: Facing;
    frame: number;
  } {
    if (this.action) {
      const kind = this.action.kind;
      const sheet = this.character.sprite[kind];
      const frame = Math.min(
        Math.floor(this.action.t / sheet.frameMs),
        sheet.frames - 1, // the dead hold the last frame forever
      );
      return { kind, sheet, facing: this.action.facing, frame };
    }
    const sheet = this.character.sprite.walk;
    // standing still means the front row, held on its first pose — but only
    // after a real stop: waypoint handoffs idle for one frame mid-walk
    const walking = this.isMoving() || this.stillFor < IDLE_GRACE_S;
    return {
      kind: "walk",
      sheet,
      facing: walking ? this.facing : "front",
      frame: walking
        ? Math.floor(this.animT / sheet.frameMs) % sheet.frames
        : 0,
    };
  }

  draw(ctx: CanvasRenderingContext2D) {
    if (this.escaped) return;
    const { kind, sheet, facing, frame } = this.pose();
    const sprite = spriteFor(sheet.src);
    if (!spriteReady(sprite)) return;
    // nearest-neighbour picks different source pixels every frame while the
    // sprite is being minified, which reads as shimmer on fine detail — so
    // filter when shrinking the cell and stay crisp once it's blown up
    const smoothFor = (s: SpriteSheet) => {
      ctx.imageSmoothingEnabled = s.size * camera.zoom < s.cell;
      ctx.imageSmoothingQuality = "high";
    };
    smoothFor(sheet);
    // snap to whole screen pixels, not whole world units: at high zoom one world
    // unit is several pixels, so rounding in world space makes walking judder
    const snap = (value: number) =>
      Math.round(value * camera.zoom) / camera.zoom;
    // the collapse animation lays the body down itself — no rotation needed
    const arc = this.dead ? 0 : Math.sin(Math.PI * this.hopT);
    ctx.save();
    ctx.translate(snap(this.x), snap(this.y - arc * HOP_HEIGHT));
    if (!this.dead) ctx.rotate(arc * this.hopTilt);

    // whitecat stands in the killer's place for as much of the reveal as is
    // showing — at 1 it replaces them outright, so their own silhouette can't
    // peek out from behind a smaller cat
    const showing = this.reveal ? revealAmount(this.reveal.t) : 0;
    const cat = showing > 0 ? whitecatSprites[kind] : null;
    const catSprite = cat ? spriteFor(cat.src) : null;
    const catReady = !!catSprite && spriteReady(catSprite);
    if (showing < 1 || !catReady) {
      drawRimmedSprite(ctx, sheet, sprite, facing, frame);
    }
    if (cat && catReady) {
      ctx.save();
      ctx.globalAlpha *= showing;
      smoothFor(cat);
      drawRimmedSprite(ctx, cat, catSprite!, facing, frame);
      ctx.restore();
      smoothFor(sheet);
    }
    if (this.reveal) {
      drawSmoke(
        ctx,
        this.reveal.t - SMOKE_AT_MS,
        hashSeed(this.character.name),
      );
    }
    ctx.restore();
  }

  drawUnderlay(ctx: CanvasRenderingContext2D, now: number) {
    if (this.escaped) return;
    ctx.save();
    ctx.translate(this.x, this.y);

    // the pool goes down first, so the body's own shadow sits on top of it
    if (this.dead) this.drawBlood(ctx);

    // contact shadow: it stays on the floor while a hop lifts the sprite, and
    // shrinks with the height of the arc
    const arc = this.dead ? 0 : Math.sin(Math.PI * this.hopT);
    ctx.save();
    ctx.beginPath();
    // y sits at the sprite's feet: it is drawn from -SPRITE_SIZE/2 - 4 downward
    ctx.ellipse(0, 12, 8 - arc, 3 - arc * 0.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = PALETTE.bodyShadow;
    ctx.fill();
    ctx.restore();

    ctx.textAlign = "center";
    ctx.font = "9px sans-serif";
    if (this.thinking) {
      const dots = ".".repeat(1 + (Math.floor(now / 400) % 3));
      // below the name label, which now owns the line just under the feet

      ctx.lineWidth = 2.5;
      ctx.lineJoin = "round";
      ctx.strokeStyle = PALETTE.labelShadow;
      ctx.strokeText(dots, 0, -25);
      ctx.fillStyle = nameColor(this);
      ctx.fillText(dots, 0, -25);
    }

    ctx.restore();
  }

  // the blood on the floor under a corpse, drawn around the local origin (the
  // feet). Its shape is seeded off the name, so a given body always bleeds the
  // same way across frames and reloads; only how far it has spread changes.
  private drawBlood(ctx: CanvasRenderingContext2D) {
    const spread = Math.min(1, this.deadFor / BLOOD_GROW_S);
    if (spread <= 0) return;
    const eased = 1 - Math.pow(1 - spread, 3); // fast at first, then creeping
    const random = mulberry32(hashSeed(this.character.name));

    ctx.save();
    ctx.translate(0, 10); // the ground line, level with the contact shadow
    ctx.scale(1, 0.5); // seen from above at this pitch, a pool reads squashed

    // one path of overlapping discs, filled once so they merge into a single
    // ragged body rather than reading as separate blobs
    ctx.beginPath();
    for (let i = 0; i < 7; i++) {
      const angle = random() * Math.PI * 2;
      const distance = random() * BLOOD_RADIUS * 0.5 * eased;
      const radius = BLOOD_RADIUS * (0.35 + random() * 0.5) * eased;
      ctx.moveTo(
        Math.cos(angle) * distance + radius,
        Math.sin(angle) * distance,
      );
      ctx.arc(
        Math.cos(angle) * distance,
        Math.sin(angle) * distance,
        radius,
        0,
        Math.PI * 2,
      );
    }
    ctx.fillStyle = PALETTE.blood;
    ctx.fill();

    // a wet highlight off-centre, so the pool doesn't read as flat paint
    ctx.beginPath();
    ctx.ellipse(
      -BLOOD_RADIUS * 0.2,
      -BLOOD_RADIUS * 0.15,
      BLOOD_RADIUS * 0.3 * eased,
      BLOOD_RADIUS * 0.2 * eased,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fillStyle = PALETTE.bloodSheen;
    ctx.fill();

    // spatter thrown clear of the pool on impact: there from the first frame,
    // so the floor reacts the moment they drop
    ctx.beginPath();
    for (let i = 0; i < 9; i++) {
      const angle = random() * Math.PI * 2;
      const distance = BLOOD_RADIUS * (0.7 + random() * 1.1);
      const radius = 0.6 + random() * 1.4;
      ctx.moveTo(
        Math.cos(angle) * distance + radius,
        Math.sin(angle) * distance,
      );
      ctx.arc(
        Math.cos(angle) * distance,
        Math.sin(angle) * distance,
        radius,
        0,
        Math.PI * 2,
      );
    }
    ctx.fillStyle = PALETTE.bloodSpatter;
    ctx.fill();

    ctx.restore();
  }

  // name label + speech bubble, drawn in world space so they scale with zoom
  drawOverlay(ctx: CanvasRenderingContext2D) {
    if (this.escaped) return;
    this.drawNameLabel(ctx);

    ctx.save();
    ctx.translate(this.x, this.y - 8);

    // bubbles stack upward from just above the head: speech first, then the
    // action emote on top when both are showing
    let stackBottom = -14;
    if (this.speech) {
      stackBottom = this.drawBubble(ctx, this.speech.text, stackBottom, {
        font: "8px sans-serif",
        lineHeight: 10,
        caret: true,
      });
    }
    if (this.emote) {
      // the caret marks the bottom-most bubble — the one pointing at the head
      this.drawBubble(ctx, `*${this.emote.text}*`, stackBottom, {
        font: "8px sans-serif",
        lineHeight: 10,
        caret: !this.speech,
      });
    }

    ctx.restore();
  }

  // the name under each character's feet, coloured by how close they are to
  // killing someone (see nameColor in src/anger.ts). Drawn in the overlay pass
  // rather than the underlay so a character standing in front of another can't
  // cover up whose label is orange.
  private drawNameLabel(ctx: CanvasRenderingContext2D) {
    // the opening credits name people themselves, in big type on a letterboxed
    // shot. A second, smaller name stuck to their feet fights that composition
    // — and an orange one would announce the temper of the room before the
    // show has even started.
    if (isCutscenePlaying()) return;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.textAlign = "center";
    ctx.font = "700 8px sans-serif";
    // a body's label stays up — it is how you tell who is on the floor — but
    // dimmed, so the living read first
    if (this.dead) ctx.globalAlpha *= 0.5;
    // outlined the way the room labels are: white on a pale floor and orange on
    // the kitchen tile both lose their edge without it
    ctx.lineWidth = 2.5;
    ctx.lineJoin = "round";
    ctx.strokeStyle = PALETTE.labelShadow;
    ctx.strokeText(this.character.name, 0, 20);
    ctx.fillStyle = nameColor(this);
    ctx.fillText(this.character.name, 0, 20);
    ctx.restore();
  }

  // draws one bubble whose bottom edge sits at `bottom`; returns the y to
  // stack the next bubble above it. Width caps to what the zoom can show.
  private drawBubble(
    ctx: CanvasRenderingContext2D,
    text: string,
    bottom: number,
    style: { font: string; lineHeight: number; caret?: boolean },
  ): number {
    bottom -= 6;
    ctx.textAlign = "center";
    ctx.font = style.font;
    const maxWidth = Math.max(60, (window.innerWidth - 80) / camera.zoom);
    const lines = wrapText(ctx, text, maxWidth);
    const width = Math.max(...lines.map((line) => ctx.measureText(line).width));
    const boxHeight = lines.length * style.lineHeight + 3;
    const bubbleTop = bottom - boxHeight;
    const left = -width / 2 - 5;
    const right = width / 2 + 5;
    const radius = 3;
    const caretHalf = 3;
    const caretDepth = 4;
    // one path for box and caret so the border doesn't cross between them
    ctx.beginPath();
    ctx.moveTo(left + radius, bubbleTop);
    ctx.lineTo(right - radius, bubbleTop);
    ctx.quadraticCurveTo(right, bubbleTop, right, bubbleTop + radius);
    ctx.lineTo(right, bottom - radius);
    ctx.quadraticCurveTo(right, bottom, right - radius, bottom);
    if (style.caret) {
      ctx.lineTo(caretHalf, bottom);
      ctx.lineTo(0, bottom + caretDepth);
      ctx.lineTo(-caretHalf, bottom);
    }
    ctx.lineTo(left + radius, bottom);
    ctx.quadraticCurveTo(left, bottom, left, bottom - radius);
    ctx.lineTo(left, bubbleTop + radius);
    ctx.quadraticCurveTo(left, bubbleTop, left + radius, bubbleTop);
    ctx.closePath();
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 1;
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#000";
    lines.forEach((line, i) => {
      ctx.fillText(
        line,
        0,
        bubbleTop + style.lineHeight - 1 + i * style.lineHeight,
      );
    });
    return bubbleTop - 4;
  }
}
