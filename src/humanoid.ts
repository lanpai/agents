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
import { logAction } from "./log";
import { camera } from "./camera";
import { speak } from "./tts";
import { simNow } from "./time";
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
const MEMORY_LIMIT = 16;
const UNCONSOLIDATED_LIMIT = 40;
const HEARD_REACTION_MS = 1500;

const sprite = new Image();
sprite.src = "/humanoid.png";

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
// is mid-decision or whose voice line is queued/playing
export function frozenRooms(world: Humanoid[]) {
  const rooms = new Set<ReturnType<typeof roomOf>>();
  for (const humanoid of world) {
    if (humanoid.dead) continue;
    if (humanoid.thinking || humanoid.speaking) {
      rooms.add(roomOf(humanoid.x, humanoid.y));
    }
  }
  return rooms;
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
  speech: { text: string; until: number } | null = null;
  emote: { text: string; until: number } | null = null; // *action* bubble
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

  // a small *action* bubble over the head for non-speech, non-movement acts
  showEmote(text: string) {
    this.emote = { text, until: simNow() + 3000 + text.length * 50 };
  }

  // both legs at 100% -> 1, one dead leg -> 0.5, both dead -> 0
  legSpeedFactor(): number {
    return (this.body["left leg"] + this.body["right leg"]) / 200;
  }

  say(text: string, world: Humanoid[], now: number, verb: "say" | "yell") {
    // talking roots you in place: any walk or follow in progress is dropped
    this.standStill();
    // the bubble tracks the voice: it appears when the line starts playing
    // and clears when it finishes, not on a sim-time timer
    const spoken = speak(
      text,
      verb === "yell" ? 1 : 0.7,
      this.character.voicePitch,
      {
        onStart: () => {
          if (!this.dead)
            this.speech = { text, until: Number.POSITIVE_INFINITY };
        },
        onEnd: () => {
          if (this.speech && this.speech.text === text) this.speech = null;
          this.speaking = false;
        },
      },
    );
    if (spoken) this.speaking = true; // freezes this room until the line ends
    // no TTS (unsupported browser or full queue): fall back to a timed bubble
    if (!spoken) this.speech = { text, until: now + 4000 + text.length * 60 };
    this.remember(
      verb === "yell" ? `You yelled: "${text}"` : `You said: "${text}"`,
    );
    // walls scope sound: talking reaches your room, yelling also reaches adjacent rooms
    const myRoom = roomOf(this.x, this.y);
    for (const other of world) {
      if (other === this || other.dead) continue;
      const otherRoom = roomOf(other.x, other.y);
      const sameRoom = otherRoom === myRoom;
      const adjacent = myRoom.doors.includes(otherRoom.name);
      if (!sameRoom && !(verb === "yell" && adjacent)) continue;
      other.remember(
        sameRoom
          ? `You heard ${this.character.name} ${verb}: "${text}"`
          : `You heard ${this.character.name} yell from the ${myRoom.name}: "${text}"`,
      );
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
    roomName: string,
    world: Humanoid[],
    running = false,
  ) {
    const [first, ...rest] = path;
    if (!first) return;
    this.target = first;
    this.pendingPath = rest;
    this.followName = null;
    this.running = running;
    const gait = running ? "running" : "walking";
    this.remember(`You started ${gait} to the ${roomName}.`);
    this.announceDeparture(world, `start ${gait} toward the ${roomName}`);
  }

  followHumanoid(name: string, world: Humanoid[], running = false) {
    this.followName = name;
    this.target = null;
    this.pendingPath = [];
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
    this.running = false;
  }

  remember(event: string) {
    this.memory.push(event);
    if (this.memory.length > MEMORY_LIMIT) this.memory.shift();
    this.unconsolidated.push(event);
    if (this.unconsolidated.length > UNCONSOLIDATED_LIMIT)
      this.unconsolidated.shift();
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
    if (this.emote && now > this.emote.until) this.emote = null;
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
            this.remember(`You arrived in the ${roomOf(this.x, this.y).name}.`);
            // arrived — worth deciding what to do next soon
            this.nextThinkAt = Math.min(this.nextThinkAt, now + 500);
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

    // room transitions are witnessed: the room left behind sees where you
    // went, the room entered sees where you came from
    const room = roomOf(this.x, this.y);
    if (this.roomName === null) {
      this.roomName = room.name; // first update after spawn/load — no crossing
    } else if (room.name !== this.roomName) {
      const fromName = this.roomName;
      this.roomName = room.name;
      for (const other of world) {
        if (other === this || other.dead) continue;
        const otherRoomName = roomOf(other.x, other.y).name;
        if (otherRoomName === fromName) {
          other.remember(
            `You saw ${this.character.name} leave the ${fromName} toward the ${room.name}.`,
          );
        } else if (otherRoomName === room.name) {
          other.remember(
            `You saw ${this.character.name} enter the ${room.name} from the ${fromName}.`,
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
    if (!sprite.complete || sprite.naturalWidth === 0) return;
    ctx.imageSmoothingEnabled = false;
    if (this.dead) {
      ctx.save();
      ctx.translate(Math.round(this.x), Math.round(this.y));
      ctx.rotate(Math.PI / 2);
      ctx.globalAlpha = 0.5;
      ctx.drawImage(sprite, -8, -8);
      ctx.restore();
      return;
    }
    const arc = Math.sin(Math.PI * this.hopT);
    ctx.save();
    ctx.translate(Math.round(this.x), Math.round(this.y) - arc * HOP_HEIGHT);
    ctx.rotate(arc * this.hopTilt);
    ctx.drawImage(sprite, -8, -8);
    ctx.restore();
  }

  drawUnderlay(ctx: CanvasRenderingContext2D, now: number) {
    ctx.save();
    ctx.translate(this.x, this.y);

    ctx.textAlign = "center";
    ctx.font = "9px monospace";
    ctx.fillStyle = "#999";
    ctx.fillText(
      this.dead ? `${this.character.name} (dead)` : this.character.name,
      0,
      19,
    );
    if (this.thinking) {
      const dots = ".".repeat(1 + (Math.floor(now / 400) % 3));
      const nameWidth = ctx.measureText(this.character.name).width;
      ctx.textAlign = "left";
      ctx.fillText(dots, nameWidth / 2 + 2, 19);
      ctx.textAlign = "center";
    }

    ctx.restore();
  }

  // name label + speech bubble, drawn in world space so they scale with zoom
  drawOverlay(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.translate(this.x, this.y);

    // bubbles stack upward from just above the head: speech first, then the
    // action emote on top when both are showing
    let stackBottom = -14;
    if (this.speech) {
      stackBottom = this.drawBubble(ctx, this.speech.text, stackBottom, {
        font: "8px monospace",
        lineHeight: 10,
      });
    }
    if (this.emote) {
      this.drawBubble(ctx, `*${this.emote.text}*`, stackBottom, {
        font: "8px monospace",
        lineHeight: 10,
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
    style: { font: string; lineHeight: number },
  ): number {
    ctx.textAlign = "center";
    ctx.font = style.font;
    const maxWidth = Math.max(60, (window.innerWidth - 80) / camera.zoom);
    const lines = wrapText(ctx, text, maxWidth);
    const width = Math.max(...lines.map((line) => ctx.measureText(line).width));
    const boxHeight = lines.length * style.lineHeight + 3;
    const bubbleTop = bottom - boxHeight;
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 1;
    ctx.fillRect(-width / 2 - 5, bubbleTop, width + 10, boxHeight);
    ctx.strokeRect(-width / 2 - 5, bubbleTop, width + 10, boxHeight);
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
