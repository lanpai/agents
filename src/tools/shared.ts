import {
  BODY_PARTS,
  TOUCH_RANGE,
  type BodyPart,
  type Humanoid,
  type StrikeVerb,
} from "../humanoid";
import {
  doorApproach,
  doorBetween,
  doorLanding,
  roomByName,
  roomOf,
} from "../locations";
import { logAction, logEmote } from "../log";
import { simNow } from "../time";
import { reportKill } from "../voting";

export function reachableTarget(
  humanoid: Humanoid,
  world: Humanoid[],
  name: unknown,
): { target: Humanoid } | { reason: string } {
  const target = world.find(
    (other) =>
      other !== humanoid &&
      !other.escaped &&
      other.character.name === name,
  );
  if (!target) return { reason: "you don't see them here" };
  if (target.dead) return { reason: "they are dead" };
  if (Math.hypot(target.x - humanoid.x, target.y - humanoid.y) > TOUCH_RANGE) {
    return { reason: "they are out of arm's reach" };
  }
  return { target };
}

export function strike(
  humanoid: Humanoid,
  world: Humanoid[],
  input: Record<string, unknown>,
  damage: number,
  verb: StrikeVerb,
) {
  const verbBase = verb.present.replace(/e?s$/, "");
  const target = world.find(
    (other) =>
      other !== humanoid &&
      !other.escaped &&
      other.character.name === input.target,
  );
  if (
    !target ||
    roomOf(target.x, target.y) !== roomOf(humanoid.x, humanoid.y)
  ) {
    humanoid.remember(
      `You tried to ${verbBase} ${input.target}, but you don't see them here.`,
    );
    logAction(
      `${humanoid.character.name} tries to attack ${input.target} (not here)`,
      humanoid,
    );
    return;
  }
  if (target.dead) {
    humanoid.remember(
      `You tried to ${verbBase} ${target.character.name}, but they are already dead.`,
    );
    logAction(
      `${humanoid.character.name} tries to attack ${target.character.name} (already dead)`,
      humanoid,
    );
    return;
  }
  const part = (BODY_PARTS as readonly string[]).includes(
    String(input.body_part),
  )
    ? (input.body_part as BodyPart)
    : "torso";

  // the moment the killer goes for the kill: audience guessing is over,
  // whether the blow lands now or after a pursuit. The stabber is the
  // killer answer, whoever they went for is the first-victim answer.
  if (verb.present === "stabs") {
    reportKill(humanoid.character.name, target.character.name);
  }

  if (Math.hypot(target.x - humanoid.x, target.y - humanoid.y) <= TOUCH_RANGE) {
    humanoid.landStrike(target, part, damage, verb, world, simNow());
    return;
  }

  // out of arm's reach: close the distance first — the follow pursues them
  // (through doors if it comes to that) and update() lands the queued blow
  // the moment they're in range
  humanoid.followHumanoid(target.character.name, world, false);
  humanoid.pendingStrike = {
    target: target.character.name,
    part,
    damage,
    verb,
  };
  humanoid.remember(
    `${target.character.name} is out of arm's reach — you close in to ${verbBase} them.`,
  );
  logAction(
    `${humanoid.character.name} moves in to ${verbBase} ${target.character.name}`,
    humanoid,
    target,
  );
}

// walk within arm's reach of a spot (e.g. an arcade cabinet), then run the
// act; runs immediately when already close enough. Like a queued blow, any
// new order given before arrival drops the queued act.
export function approachAndUse(
  humanoid: Humanoid,
  spot: { x: number; y: number },
  label: string,
  act: () => void,
) {
  if (Math.hypot(spot.x - humanoid.x, spot.y - humanoid.y) <= TOUCH_RANGE) {
    act();
    return;
  }
  humanoid.target = { x: spot.x, y: spot.y };
  humanoid.pendingPath = [];
  humanoid.followName = null;
  humanoid.pendingStrike = null;
  humanoid.running = false;
  humanoid.pendingUse = { x: spot.x, y: spot.y, act };
  humanoid.remember(`You walk up to the ${label}.`);
  logAction(`${humanoid.character.name} walks up to the ${label}`, humanoid);
}

export function follow(
  humanoid: Humanoid,
  world: Humanoid[],
  input: Record<string, unknown>,
  running: boolean,
) {
  const target = world.find(
    (other) =>
      other !== humanoid &&
      !other.escaped &&
      other.character.name === input.name &&
      roomOf(other.x, other.y) === roomOf(humanoid.x, humanoid.y),
  );
  if (target && wouldCreateFollowLoop(humanoid, target, world)) {
    humanoid.remember(
      `You tried to follow ${target.character.name}, but they are already following you — you'd just walk in circles.`,
    );
    logAction(
      `${humanoid.character.name} tries to follow ${target.character.name} (follow loop)`,
      humanoid,
      target,
    );
  } else if (target) {
    humanoid.followHumanoid(target.character.name, world, running);
    logAction(
      `${humanoid.character.name} ${running ? "runs" : "heads"} toward ${target.character.name}`,
      humanoid,
      target,
    );
  } else {
    humanoid.remember(`You looked for ${input.name} but couldn't see them.`);
    logAction(
      `${humanoid.character.name} looks for ${input.name} but can't see them`,
      humanoid,
    );
  }
}

export function moveToRoom(
  humanoid: Humanoid,
  world: Humanoid[],
  input: Record<string, unknown>,
  running: boolean,
) {
  const current = roomOf(humanoid.x, humanoid.y);
  const targetRoom = roomByName(String(input.room));
  if (!targetRoom || !current.doors.includes(targetRoom.name)) {
    humanoid.remember(
      `There is no door to ${input.room} from ${current.promptName}.`,
    );
    return;
  }
  humanoid.goToRoom(
    [
      doorApproach(current, targetRoom),
      doorBetween(current, targetRoom),
      doorLanding(current, targetRoom),
    ],
    targetRoom.promptName,
    world,
    running,
  );
  logAction(
    `${humanoid.character.name} ${running ? "runs" : "walks"} to ${targetRoom.promptName}`,
    humanoid,
  );
}

// living humanoids sharing the room — the audience for speech
export function roommateNames(humanoid: Humanoid, world: Humanoid[]): string[] {
  const room = roomOf(humanoid.x, humanoid.y);
  return world
    .filter(
      (other) =>
        other !== humanoid &&
        !other.dead &&
        !other.escaped &&
        roomOf(other.x, other.y) === room,
    )
    .map((other) => other.character.name);
}

// everything a humanoid can head to right now: doors out of the room, plus
// everyone currently in the room
export function destinations(humanoid: Humanoid, world: Humanoid[]): string[] {
  const room = roomOf(humanoid.x, humanoid.y);
  const roommates = world
    .filter(
      (other) =>
        other !== humanoid &&
        !other.escaped &&
        roomOf(other.x, other.y) === room &&
        other.followName !== humanoid.character.name,
    )
    .map((other) => other.character.name);
  return [...room.doors, ...roommates];
}

export function travelTo(
  humanoid: Humanoid,
  world: Humanoid[],
  destination: string,
  running: boolean,
) {
  const room = roomOf(humanoid.x, humanoid.y);
  if (room.doors.includes(destination)) {
    moveToRoom(humanoid, world, { room: destination }, running);
  } else {
    follow(humanoid, world, { name: destination }, running);
  }
}

// walks the follow chain from the target; if it leads back to the would-be
// follower, the new follow would close a cycle (A→B→…→A) and everyone involved
// would trail each other forever
function wouldCreateFollowLoop(
  follower: Humanoid,
  target: Humanoid,
  world: Humanoid[],
): boolean {
  const seen = new Set<Humanoid>();
  let current: Humanoid | undefined = target;
  while (current && !seen.has(current)) {
    if (current === follower) return true;
    seen.add(current);
    const nextName: string | null = current.followName;
    current = nextName
      ? world.find((other) => other.character.name === nextName)
      : undefined;
  }
  return false;
}
