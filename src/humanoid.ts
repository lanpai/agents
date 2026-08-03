import {
  doorApproach,
  doorBetween,
  doorThrough,
  findPath,
  roomByName,
  roomOf,
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
import { speak } from "./tts";
import { simNow } from "./time";
import { PALETTE, silhouette } from "./theme";
import type { Character } from "./characters/types";
import type { Status } from "./statuses/types";

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
const MEMORY_LIMIT = 16;
const UNCONSOLIDATED_LIMIT = 40;
const HEARD_REACTION_MS = 1500;

// one Image per sprite path, shared across every humanoid using it
const spriteCache = new Map<string, HTMLImageElement>();
const SPRITE_SIZE = 36; // world-unit footprint every sprite is drawn at

function spriteFor(src: string): HTMLImageElement {
  let image = spriteCache.get(src);
  if (!image) {
    image = new Image();
    image.src = src;
    spriteCache.set(src, image);
  }
  return image;
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

// halo + sprite, drawn around the humanoid's own origin
function drawRimmedSprite(
  ctx: CanvasRenderingContext2D,
  src: string,
  image: HTMLImageElement,
  half: number,
) {
  const rim = rimFor(src, image);
  if (rim) {
    ctx.save();
    ctx.globalAlpha = ctx.globalAlpha * 0.32;
    for (const [dx, dy] of RIM_OFFSETS) {
      ctx.drawImage(rim, -half + dx, -half - 4 + dy, SPRITE_SIZE, SPRITE_SIZE);
    }
    ctx.restore();
  }
  ctx.drawImage(image, -half, -half - 4, SPRITE_SIZE, SPRITE_SIZE);
}

// remember() an event for every living humanoid in the source's room, except
// the source themself; pass a function to vary the text per viewer
export function broadcastToRoom(
  source: Humanoid,
  world: Humanoid[],
  event: string | ((viewer: Humanoid) => string),
) {
  const room = roomOf(source.x, source.y);
  for (const other of world) {
    if (other === source || other.dead) continue;
    if (roomOf(other.x, other.y) !== room) continue;
    other.remember(typeof event === "function" ? event(other) : event);
  }
}

// rooms where time currently stands still: any room holding a humanoid who
// is mid-decision, whose voice line is queued/playing, or whose emote the
// camera hasn't witnessed yet
export function frozenRooms(world: Humanoid[]) {
  const rooms = new Set<ReturnType<typeof roomOf>>();
  for (const humanoid of world) {
    if (humanoid.dead) continue;
    if (humanoid.thinking || humanoid.speaking || humanoid.emoteHold) {
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

export function updateEmoteHolds(world: Humanoid[], dt: number) {
  for (const humanoid of world) {
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
function outgoingSpeechWarp(speaker: Humanoid) {
  return null;
}

function incomingSpeechWarp(hearer: Humanoid) {
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
  speech: { text: string; until: number } | null = null;
  emote: { text: string } | null = null; // *action* bubble, lives as long as its hold
  // freezes the room until the camera has watched the emote (wall-time seconds)
  emoteHold: { seenFor: number; heldFor: number } | null = null;
  memory: string[] = [];
  longMemory = "";
  unconsolidated: string[] = []; // events not yet folded into longMemory

  thinking = false;
  speaking = false; // a TTS line of theirs is queued or playing
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

  isMoving(): boolean {
    return this.vx !== 0 || this.vy !== 0;
  }

  // a small *action* bubble over the head for non-speech, non-movement acts;
  // like talking it freezes the room, and both the freeze and the bubble last
  // until the camera has seen the act
  showEmote(text: string) {
    this.emote = { text };
    this.emoteHold = { seenFor: 0, heldFor: 0 };
  }

  // both legs at 100% -> 1, one dead leg -> 0.5, both dead -> 0
  legSpeedFactor(): number {
    return (this.body["left leg"] + this.body["right leg"]) / 200;
  }

  say(
    text: string,
    world: Humanoid[],
    now: number,
    verb: "say" | "yell",
    delivery?: string, // stage direction for the voice, passed to transcription
  ) {
    // trim quotes if fully wrapped (avoids trimming text that starts of ends with quoted text)
    if (text.startsWith('"') && text.endsWith('"'))
      text = text.substring(1, text.length - 1);

    // talking roots you in place: any walk or follow in progress is dropped
    this.standStill();
    // the speaker remembers what they meant to say, even when a status warps
    // what actually leaves their mouth
    this.remember(
      verb === "yell" ? `You yelled: "${text}"` : `You said: "${text}"`,
    );

    const warp = outgoingSpeechWarp(this);
    if (!warp) {
      this.deliverLine(text, world, now, verb, delivery);
      return;
    }
    // hold the room frozen while the line is being warped, exactly like a
    // queued voice line; delivery re-arms the flag when it lands
    this.speaking = true;
    warp(text)
      .catch(() => text)
      .then((warped) => {
        this.speaking = false;
        if (this.dead) return;
        this.deliverLine(warped, world, simNow(), verb, delivery);
      });
  }

  // the world-facing half of speaking: bubble, voice, log, and what everyone
  // in earshot hears (each hearer's own statuses may warp it once more)
  private deliverLine(
    text: string,
    world: Humanoid[],
    now: number,
    verb: "say" | "yell",
    delivery?: string,
  ) {
    // the bubble tracks the voice: it appears when the line starts playing
    // and clears when it finishes, not on a sim-time timer
    const spoken = speak(text, {
      speaker: this.character.name,
      voice: this.character.voice,
      delivery,
      volume: verb === "yell" ? 1 : 0.7,
      onStart: () => {
        if (this.dead) return;
        this.speech = { text, until: Number.POSITIVE_INFINITY };
        // the camera cuts when the line becomes audible, not when it was
        // queued: with lines queued from different rooms, play order —
        // not decision order — picks who is on screen
        focusCameraOnSpeaker(this);
      },
      onEnd: () => {
        if (this.speech && this.speech.text === text) this.speech = null;
        this.speaking = false;
      },
    });
    if (spoken) this.speaking = true; // freezes this room until the line ends
    // no TTS (unsupported browser or full queue): fall back to a timed bubble,
    // and focus now since there is no utterance start to cut on
    if (!spoken) {
      this.speech = { text, until: now + 4000 + text.length * 60 };
      focusCamera([this]);
    }
    logQuietAction(
      `${this.character.name} ${verb === "yell" ? "yells" : "says"}: "${text}"`,
      this,
    );
    // walls scope sound: talking reaches your room, yelling also reaches adjacent rooms
    const myRoom = roomOf(this.x, this.y);
    for (const other of world) {
      if (other === this || other.dead) continue;
      const otherRoom = roomOf(other.x, other.y);
      const sameRoom = otherRoom === myRoom;
      const adjacent = myRoom.doors.includes(otherRoom.name);
      if (!sameRoom && !(verb === "yell" && adjacent)) continue;
      const compose = (heard: string) =>
        sameRoom
          ? `You heard ${this.character.name} ${verb}: "${heard}"`
          : `You heard ${this.character.name} yell from ${myRoom.promptName}: "${heard}"`;
      const hearWarp = incomingSpeechWarp(other);
      if (hearWarp) {
        // the hearer's own filter rewrites the line before it lands in memory
        hearWarp(text, this.character.name)
          .catch(() => text)
          .then((heard) => {
            if (!other.dead) other.remember(compose(heard));
          });
      } else {
        other.remember(compose(text));
      }
      other.nextThinkAt = Math.min(
        other.nextThinkAt,
        now + HEARD_REACTION_MS + Math.random() * 2000,
      );
    }
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
  ) {
    const room = roomOf(target.x, target.y);
    for (const witness of world) {
      if (witness === this || witness === target || witness.dead) continue;
      if (roomOf(witness.x, witness.y) !== room) continue;
      witness.remember(
        `You saw ${this.character.name} ${verb.past} ${target.character.name}'s ${part}!`,
      );
      witness.nextThinkAt = Math.min(witness.nextThinkAt, now + 500);
    }

    target.takeDamage(part, damage, world, now);
    this.remember(`You ${verb.past} ${target.character.name}'s ${part}.`);
    if (!target.dead) {
      target.remember(`${this.character.name} ${verb.past} your ${part}!`);
      target.nextThinkAt = Math.min(target.nextThinkAt, now + 500);
    }
    logEmote(
      `${this.character.name} ${verb.present} ${target.character.name}'s ${part}`,
      this,
      target,
    );
  }

  takeDamage(part: BodyPart, amount: number, world: Humanoid[], now: number) {
    if (this.dead) return;
    this.body[part] = Math.max(0, this.body[part] - amount);
    if ((part === "head" || part === "torso") && this.body[part] <= 0) {
      this.die(world, now);
    }
  }

  die(world: Humanoid[], now: number) {
    if (this.dead) return;
    this.dead = true;
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
      if (other === this || other.dead) continue;
      if (roomOf(other.x, other.y) === myRoom) {
        other.remember(`You saw ${this.character.name} collapse and die.`);
        other.nextThinkAt = Math.min(other.nextThinkAt, now + 500);
      }
    }
  }

  update(dt: number, now: number, world: Humanoid[]) {
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
        (other) => other.character.name === this.followName,
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
      if (this.pendingPath.length === 0) {
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
      if (!target || target.dead) {
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
        if (other === this || other.dead) continue;
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

  draw(ctx: CanvasRenderingContext2D) {
    const sprite = spriteFor(this.character.sprite);
    if (!sprite.complete || sprite.naturalWidth === 0) return;
    ctx.imageSmoothingEnabled = false;
    const half = SPRITE_SIZE / 2;
    if (this.dead) {
      ctx.save();
      ctx.translate(Math.round(this.x), Math.round(this.y));
      ctx.rotate(Math.PI / 2);
      ctx.globalAlpha = 0.5;
      drawRimmedSprite(ctx, this.character.sprite, sprite, half);
      ctx.restore();
      return;
    }
    const arc = Math.sin(Math.PI * this.hopT);
    ctx.save();
    ctx.translate(Math.round(this.x), Math.round(this.y) - arc * HOP_HEIGHT);
    ctx.rotate(arc * this.hopTilt);
    drawRimmedSprite(ctx, this.character.sprite, sprite, half);
    ctx.restore();
  }

  drawUnderlay(ctx: CanvasRenderingContext2D, now: number) {
    ctx.save();
    ctx.translate(this.x, this.y);

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
    ctx.fillStyle = PALETTE.nameText;
    // ctx.fillText(
    //   this.dead ? `${this.character.name} (dead)` : this.character.name,
    //   0,
    //   19,
    // );
    if (this.thinking) {
      const dots = ".".repeat(1 + (Math.floor(now / 400) % 3));
      ctx.fillText(dots, 0, 19);
    }

    ctx.restore();
  }

  // name label + speech bubble, drawn in world space so they scale with zoom
  drawOverlay(ctx: CanvasRenderingContext2D) {
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
