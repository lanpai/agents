// Who snaps, and when.
//
// Every humanoid carries a continuous 0..100 anger value. Two things push it
// up: a constant drift that every character shares, and what they hear people
// say to them. The drift is what makes the pacing a level-design decision
// rather than a coin flip — on its own it reaches the murderous threshold in
// about six minutes, and an ordinary run of barbed conversation pulls that in
// to about four. The conversation half is what decides *who* it is.
//
// The value is deliberately kept continuous and free of any drawing: tiers
// exist as a lookup for whatever UI wants them later, and nothing in the sim
// reads a tier to make a decision — only MURDEROUS_AT matters.

import type { Humanoid } from "./humanoid";
import { roomOf } from "./locations";
import { addStatusToHumanoid } from "./statuses";
import { MurderousIntent } from "./statuses/murderousIntent";

export const ANGER_MAX = 100;
export const MURDEROUS_AT = 85;

// bands for a future gauge — a name and a colour per step, lowest first. Read
// with angerTier(); nothing else in the sim branches on these.
export const ANGER_TIERS = [
  { at: 0, name: "calm", color: "#e8ecf4" },
  { at: 30, name: "irritated", color: "#ffd34d" },
  { at: 60, name: "seething", color: "#ff8c2b" },
  { at: MURDEROUS_AT, name: "murderous", color: "#e8332a" },
] as const;

export type AngerTier = (typeof ANGER_TIERS)[number];

// ---------------------------------------------------------------------------
// balance
//
// Timings are in real seconds, not sim seconds: sim time stops dead while
// anyone is thinking or a line is being spoken, so a sim-time budget would
// drift far away from the four minutes a person actually sits through.
//
// THE PACING KNOB. How long, in real minutes, until someone turns if the
// office stays perfectly civil — the drift alone reaches MURDEROUS_AT here, and
// friction in the conversation only ever pulls it in earlier.
//
// It is set below the four minutes the murder is aimed at, because turning is
// not killing: the new killer still has to reach the kitchen, pick the knife
// up, find their target and close on them, which is several decisions' worth of
// walking. That approach is the part LLM pacing owns and this constant doesn't.
// If murders keep landing late, lower this; if they land early, raise it.
const MINUTES_TO_BOIL = 2.5;

// ...for the hottest temper in the building. Everyone drifts at their own
// fraction of that rate, drawn once when they spawn, so the gauges fan out
// instead of rising as one block. A uniform drift makes every gauge identical
// and the "first" to cross is whoever the array happens to list first — the
// same character every run, decided by nothing.
const TEMPER_MIN = 0.5;
const TEMPER_MAX = 1;

export function rollTemper(): number {
  return TEMPER_MIN + Math.random() * (TEMPER_MAX - TEMPER_MIN);
}

// A killer who never gets it done cannot be allowed to hold the role forever —
// the run just stops. Two ways out, whichever comes first:
//   - their nerve goes: pleasant conversation cools them back under this line
//   - they dawdle: this many real seconds pass without a body
// Either way the intent lifts, the knife goes back on the floor, and the gauge
// resets low enough that somebody else is next in line rather than them again.
const NERVE_FAILS_UNDER = 70;
const KILLER_GRACE_S = 240;
const SPENT_ANGER = 25;
// a killer cools far slower than they heat: at full rate a couple of pleasant
// remarks unseat them within a minute, and the role churns from one character
// to the next fast enough that nobody is ever murderous long enough to walk to
// the kitchen. Losing your nerve should take sustained warmth, not one kind word.
const KILLER_COOLING = 0.3;

// the drift carries almost all of the load in practice: these characters are
// pleasant to each other, and an earlier pass that leaned on conversation for a
// third of the total sat at six minutes with nobody having turned
const DRIFT_PER_MINUTE = MURDEROUS_AT / MINUTES_TO_BOIL;

// what a line does to the people who hear it. The speaker feels a share of it
// too — you wind yourself up saying these things. A friendly line still only
// shaves whatever sits above the drift's floor; it cannot buy time.
const HOSTILITY_GAIN: Record<string, number> = {
  friendly: -3,
  neutral: 1,
  barbed: 7,
  hostile: 14,
};
const SPEAKER_SHARE = 0.6;
const YELL_MULTIPLIER = 1.4;

export const HOSTILITY_LEVELS = Object.keys(HOSTILITY_GAIN);

// once someone has turned, everyone else is held just short of the line: the
// story has its killer, and a second one would make it a brawl
const BYSTANDER_CAP = MURDEROUS_AT - 1;

export function angerTier(value: number): AngerTier {
  let tier: AngerTier = ANGER_TIERS[0];
  for (const candidate of ANGER_TIERS) {
    if (value >= candidate.at) tier = candidate;
  }
  return tier;
}

// 0..1, for a gauge that wants a fraction rather than a band
export function angerRatio(humanoid: Humanoid): number {
  return Math.max(0, Math.min(1, humanoid.anger / ANGER_MAX));
}

export function isKiller(humanoid: Humanoid): boolean {
  return !humanoid.escaped && humanoid.statuses.has("Murderous Intent");
}

export function killerIn(world: Humanoid[]): Humanoid | null {
  return world.find(isKiller) ?? null;
}

// the constant simmer, ticked from the main loop on real seconds. This is also
// where a boiled-over character is promoted, so there is exactly one place
// that can create a killer.
export function driftAnger(world: Humanoid[], dt: number) {
  let claimed = killerIn(world);
  // the drift deliberately does not touch the killer: their gauge has to stay
  // free to fall, or losing their nerve could never happen
  // once blood is drawn there is no coming back from it: no grace timer, no
  // losing their nerve. They just need someone new to point at.
  if (claimed?.hasKilled) retarget(claimed, world);
  if (claimed && !claimed.hasKilled) {
    claimed.killerFor += dt;
    if (
      claimed.dead ||
      claimed.anger < NERVE_FAILS_UNDER ||
      claimed.killerFor >= KILLER_GRACE_S
    ) {
      standDown(claimed, world);
      claimed = null;
    }
  }
  for (const humanoid of world) {
    if (humanoid.dead || humanoid.escaped) continue;
    if (humanoid === claimed) continue; // already turned; the gauge is spent
    // the drift raises a floor rather than the value itself, and the value is
    // never allowed under it. Otherwise a room being pleasant to each other
    // subtracts faster than the drift adds and the run never boils at all —
    // kindness may cool a spike, but it cannot stop the clock.
    humanoid.angerFloor = Math.min(
      ANGER_MAX,
      humanoid.angerFloor +
        (DRIFT_PER_MINUTE * humanoid.temper * dt) / 60,
    );
    const ceiling = claimed ? BYSTANDER_CAP : ANGER_MAX;
    humanoid.anger = Math.min(
      ceiling,
      Math.max(humanoid.anger, humanoid.angerFloor),
    );
  }
  if (claimed) return;
  // the murder has happened: the story has its killer and nobody replaces them
  if (world.some((humanoid) => humanoid.hasKilled)) return;
  // the angriest of anyone at the line takes it, so two people crossing on the
  // same frame can't both turn. Ties break on temper, never on position in the
  // world array — everyone pinned at the ceiling would otherwise hand it to
  // whoever happens to be listed first, every single time.
  const boiling = world
    .filter(
      (humanoid) =>
        !humanoid.dead && !humanoid.escaped && humanoid.anger >= MURDEROUS_AT,
    )
    .sort((a, b) => b.anger - a.anger || b.temper - a.temper)[0];
  if (boiling) makeKiller(boiling, world);
}

// a line lands on everyone in earshot; `listeners` is whoever the caller
// decided could hear it, which already accounts for walls and yelling
export function feelSpeech(
  speaker: Humanoid,
  listeners: Humanoid[],
  hostility: string,
  verb: "say" | "yell",
  world: Humanoid[],
) {
  const base = HOSTILITY_GAIN[hostility];
  if (base === undefined) return; // model invented a level; treat it as nothing
  const capped = killerIn(world) !== null;
  const gain = base * (verb === "yell" ? YELL_MULTIPLIER : 1);
  for (const listener of listeners) {
    if (listener.dead || listener.escaped) continue;
    raise(listener, gain, capped);
    // who it was aimed at matters as much as how much: a killer goes after
    // whoever wound them up most, not a name drawn out of a hat
    if (gain > 0) {
      listener.grudge.set(
        speaker.character.name,
        (listener.grudge.get(speaker.character.name) ?? 0) + gain,
      );
    }
  }
  raise(speaker, gain * SPEAKER_SHARE, capped);
}

function raise(humanoid: Humanoid, amount: number, capped: boolean) {
  const scaled =
    amount < 0 && isKiller(humanoid) ? amount * KILLER_COOLING : amount;
  // the ceiling only binds bystanders; the killer's own gauge is already past it
  const ceiling = capped && !isKiller(humanoid) ? BYSTANDER_CAP : ANGER_MAX;
  humanoid.anger = Math.max(0, Math.min(ceiling, humanoid.anger + scaled));
}

// a killer who has already used the knife keeps going until there is nobody
// left to use it on: the moment their mark is dead, the next one is named
function retarget(killer: Humanoid, world: Humanoid[]) {
  const intent = killer.statuses.get("Murderous Intent") as
    | MurderousIntent
    | undefined;
  if (!intent) return;
  const mark = world.find((other) => other.character.name === intent.target);
  if (mark && !mark.dead && !mark.escaped) return; // still available; finish that one first
  // a spree doesn't work down a grudge list — it works outward from where they
  // are standing. Sending them across the building past a closer victim reads
  // as a bug, and gives everyone in between time to walk away.
  const next = nearestLiving(killer, world)?.character.name ?? "";
  if (next === intent.target) return;
  intent.target = next;
  if (next) {
    console.log(`[anger] ${killer.character.name} moves on to ${next}`);
  }
}

// the intent lifts: they put the knife down wherever they are and drop back
// down the queue, so the next boil is someone else's
function standDown(humanoid: Humanoid, world: Humanoid[]) {
  humanoid.statuses.delete("Murderous Intent");
  humanoid.killerFor = 0;
  humanoid.anger = SPENT_ANGER;
  humanoid.angerFloor = SPENT_ANGER;
  humanoid.grudge.clear();
  dropKnife(humanoid);
  console.log(`[anger] ${humanoid.character.name} lost their nerve`);
  // everyone else has been pinned at the bystander ceiling while this ran;
  // nudging them apart keeps the next pick from being a coin flip
  for (const other of world) {
    if (other === humanoid || other.dead || other.escaped) continue;
    other.anger = Math.min(other.anger, BYSTANDER_CAP);
  }
}

function dropKnife(humanoid: Humanoid) {
  for (const item of [...humanoid.carrying]) {
    if (item.name !== "Knife") continue;
    humanoid.carrying.splice(humanoid.carrying.indexOf(item), 1);
    item.position = { x: humanoid.x, y: humanoid.y };
    roomOf(humanoid.x, humanoid.y).interactables.push(item);
    humanoid.remember(`You put the ${item.name} down.`);
  }
}

function makeKiller(humanoid: Humanoid, world: Humanoid[]) {
  const intent = addStatusToHumanoid(humanoid, MurderousIntent);
  intent.target = pickTarget(humanoid, world);
  humanoid.killerFor = 0;
  // whoever else was carrying the knife puts it down: with one blade in the
  // building, a bystander holding it is a run that can never end, and there is
  // no tool for taking something off a person
  for (const other of world) {
    if (other !== humanoid) dropKnife(other);
  }
  // no on-screen tell: the whole point is that nobody knows yet. This line is
  // for tuning the pacing from the console.
  console.log(
    `[anger] ${humanoid.character.name} has turned on ${intent.target}`,
  );
}

// whoever has needled them most; failing that, the nearest living soul
function pickTarget(humanoid: Humanoid, world: Humanoid[]): string {
  const others = world.filter(
    (other) => other !== humanoid && !other.dead && !other.escaped,
  );
  if (others.length === 0) return "";
  const ranked = others
    .map((other) => ({
      other,
      grudge: humanoid.grudge.get(other.character.name) ?? 0,
    }))
    .sort((a, b) => b.grudge - a.grudge);
  if (ranked[0]!.grudge > 0) return ranked[0]!.other.character.name;
  return nearestLiving(humanoid, world)?.character.name ?? "";
}

function nearestLiving(humanoid: Humanoid, world: Humanoid[]): Humanoid | null {
  let best: Humanoid | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const other of world) {
    if (other === humanoid || other.dead || other.escaped) continue;
    const distance = Math.hypot(other.x - humanoid.x, other.y - humanoid.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = other;
    }
  }
  return best;
}
