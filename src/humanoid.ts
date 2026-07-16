import { ROOMS, roomOf } from "./locations";
import { logAction } from "./log";
import { selected } from "./selection";
import { speak } from "./tts";

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

export const TEMPERATURES = [
  "freezing",
  "cold",
  "normal",
  "warm",
  "hot",
] as const;
export type Temperature = (typeof TEMPERATURES)[number];

const WALK_SPEED = 24;
const RUN_MULTIPLIER = 2;
const STAMINA_DRAIN = 4; // per second of walking; running doubles it
const STAMINA_REGEN = 6; // per second while not moving
const BODY_HEAL_RATE = 0.3; // per second — much slower than stamina regen
const EXHAUSTED_LEG_DAMAGE = 2; // per second per leg while moving at 0 stamina
const SPAWN_MARGIN = 24; // keep spawn points off the walls
const HOP_DURATION = 0.3;
const HOP_HEIGHT = 5;
const HOP_MAX_TILT = 0.3;
const ARRIVE_DISTANCE = 2;
const FOLLOW_DISTANCE = 20;
const MEMORY_LIMIT = 8;
const UNCONSOLIDATED_LIMIT = 40;
const HEARD_REACTION_MS = 1500;

const NAMES = [
  "Ava",
  "Bo",
  "Cyrus",
  "Dara",
  "Echo",
  "Faye",
  "Gus",
  "Hana",
  "Ivo",
  "Juno",
  "Kai",
  "Lira",
  "Milo",
  "Nova",
  "Opal",
  "Pax",
  "Quinn",
  "Rue",
  "Sol",
  "Tess",
];

const PERSONALITIES = [
  "cheerful and chatty",
  "shy but curious",
  "restless explorer",
  "calm and thoughtful",
  "playful prankster",
  "nosy gossip",
  "quiet loner who warms up slowly",
  "dramatic storyteller",
];

const sprite = new Image();
sprite.src = "/humanoid.png";

export class Humanoid {
  name: string;
  personality: string;
  x: number;
  y: number;
  vx = 0;
  vy = 0;
  hopT = 0; // 0 = grounded, (0,1) = mid-hop arc
  hopTilt = 0;

  temperature: Temperature = "normal";
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
  inventory: string[] = [];

  target: { x: number; y: number } | null = null;
  pendingPath: { x: number; y: number }[] = []; // waypoints after the current target
  followName: string | null = null;
  speech: { text: string; until: number } | null = null;
  memory: string[] = [];
  longMemory = "";
  unconsolidated: string[] = []; // events not yet folded into longMemory

  thinking = false;
  nextThinkAt: number;
  consolidating = false;
  nextMemoryAt = 0;

  constructor(name: string, personality: string, x: number, y: number) {
    this.name = name;
    this.personality = personality;
    this.x = x;
    this.y = y;
    // stagger first decisions so 20 agents don't all call the API at once
    this.nextThinkAt = performance.now() + Math.random() * 10000;
  }

  static spawnRandom(index: number, _existing: Humanoid[]): Humanoid {
    const room = ROOMS[Math.floor(Math.random() * ROOMS.length)]!;
    const reach = room.size / 2 - SPAWN_MARGIN;
    return new Humanoid(
      NAMES[index % NAMES.length]!,
      PERSONALITIES[index % PERSONALITIES.length]!,
      room.x + (Math.random() * 2 - 1) * reach,
      room.y + (Math.random() * 2 - 1) * reach,
    );
  }

  static spawnKiller() {
    const killer = new Humanoid(
      "Blop",
      "secret assassin, tries to to lure people away from others and kill them, master manipulator, will carefully weave lies to get out of sticky situations",
      0,
      0,
    );
    killer.inventory.push("knife");
    return killer;
  }

  isMoving(): boolean {
    return this.vx !== 0 || this.vy !== 0;
  }

  // both legs at 100% -> 1, one dead leg -> 0.5, both dead -> 0
  legSpeedFactor(): number {
    return (this.body["left leg"] + this.body["right leg"]) / 200;
  }

  say(text: string, world: Humanoid[], now: number, verb: "say" | "yell") {
    // the bubble tracks the voice: it appears when the line starts playing
    // and clears when it finishes, not on a sim-time timer
    const spoken = speak(this.name, text, verb === "yell" ? 1 : 0.7, {
      onStart: () => {
        if (!this.dead) this.speech = { text, until: Number.POSITIVE_INFINITY };
      },
      onEnd: () => {
        if (this.speech && this.speech.text === text) this.speech = null;
      },
    });
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
          ? `You heard ${this.name} ${verb}: "${text}"`
          : `You heard ${this.name} yell from the ${myRoom.name}: "${text}"`,
      );
      other.nextThinkAt = Math.min(
        other.nextThinkAt,
        now + HEARD_REACTION_MS + Math.random() * 2000,
      );
    }
  }

  // two-leg path: through the door, then to the middle of the next room
  goToRoom(
    door: { x: number; y: number },
    center: { x: number; y: number },
    roomName: string,
    running = false,
  ) {
    this.target = door;
    this.pendingPath = [center];
    this.followName = null;
    this.running = running;
    this.remember(
      `You started ${running ? "running" : "walking"} to the ${roomName}.`,
    );
  }

  followHumanoid(name: string, running = false) {
    this.followName = name;
    this.target = null;
    this.pendingPath = [];
    this.running = running;
    this.remember(
      `You started ${running ? "running" : "walking"} toward ${name}.`,
    );
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
    logAction(`${this.name} dies!`, this);
    this.vx = 0;
    this.vy = 0;
    this.target = null;
    this.pendingPath = [];
    this.followName = null;
    this.speech = null;
    const myRoom = roomOf(this.x, this.y);
    for (const other of world) {
      if (other === this || other.dead) continue;
      if (roomOf(other.x, other.y) === myRoom) {
        other.remember(`You saw ${this.name} collapse and die.`);
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
      const followed = world.find((other) => other.name === this.followName);
      if (!followed) {
        this.followName = null;
      } else if (roomOf(followed.x, followed.y) !== roomOf(this.x, this.y)) {
        // can't follow through walls
        this.followName = null;
        this.remember(`${followed.name} left the room.`);
        this.nextThinkAt = Math.min(this.nextThinkAt, now + 500);
      } else {
        destination = {
          x: followed.x,
          y: followed.y,
          stopDistance: FOLLOW_DISTANCE,
        };
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
      if (this.stamina > 0) {
        this.stamina = Math.max(0, this.stamina - STAMINA_DRAIN * effort * dt);
      } else {
        // moving while exhausted grinds down both legs instead
        this.body["left leg"] = Math.max(
          0,
          this.body["left leg"] - EXHAUSTED_LEG_DAMAGE * effort * dt,
        );
        this.body["right leg"] = Math.max(
          0,
          this.body["right leg"] - EXHAUSTED_LEG_DAMAGE * effort * dt,
        );
      }
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

  // name label + speech bubble, drawn in world space so they scale with zoom
  drawOverlay(ctx: CanvasRenderingContext2D, now: number) {
    ctx.save();
    ctx.translate(this.x, this.y);

    ctx.textAlign = "center";
    ctx.font = "9px monospace";
    ctx.fillStyle = "#999";
    ctx.fillText(this.dead ? `${this.name} (dead)` : this.name, 0, 19);
    if (this.thinking) {
      const dots = ".".repeat(1 + (Math.floor(now / 400) % 3));
      const nameWidth = ctx.measureText(this.name).width;
      ctx.textAlign = "left";
      ctx.fillText(dots, nameWidth / 2 + 2, 19);
      ctx.textAlign = "center";
    }

    if (this.speech) {
      ctx.font = "11px monospace";
      const width = ctx.measureText(this.speech.text).width;
      const bubbleTop = -30;
      ctx.fillStyle = "#fff";
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 1;
      ctx.fillRect(-width / 2 - 5, bubbleTop, width + 10, 16);
      ctx.strokeRect(-width / 2 - 5, bubbleTop, width + 10, 16);
      ctx.fillStyle = "#000";
      ctx.fillText(this.speech.text, 0, bubbleTop + 12);
    }

    ctx.restore();
  }
}
