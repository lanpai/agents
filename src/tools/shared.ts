import {
  BODY_PARTS,
  TOUCH_RANGE,
  type BodyPart,
  type Humanoid,
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

export function reachableTarget(
  humanoid: Humanoid,
  world: Humanoid[],
  name: unknown,
): { target: Humanoid } | { reason: string } {
  const target = world.find(
    (other) => other !== humanoid && other.character.name === name,
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
  verb: { present: string; past: string },
) {
  const result = reachableTarget(humanoid, world, input.target);
  if ("reason" in result) {
    humanoid.remember(
      `You tried to ${verb.present.replace(/e?s$/, "")} ${input.target}, but ${result.reason}.`,
    );
    logAction(
      `${humanoid.character.name} tries to attack ${input.target} (${result.reason})`,
      humanoid,
    );
    return;
  }
  const part = (BODY_PARTS as readonly string[]).includes(
    String(input.body_part),
  )
    ? (input.body_part as BodyPart)
    : "torso";
  const now = simNow();

  // everyone else in the room witnesses the strike (before takeDamage, so a
  // possible death broadcast lands after it in their memory)
  const room = roomOf(result.target.x, result.target.y);
  for (const witness of world) {
    if (witness === humanoid || witness === result.target || witness.dead)
      continue;
    if (roomOf(witness.x, witness.y) !== room) continue;
    witness.remember(
      `You saw ${humanoid.character.name} ${verb.past} ${result.target.character.name}'s ${part}!`,
    );
    witness.nextThinkAt = Math.min(witness.nextThinkAt, now + 500);
  }

  result.target.takeDamage(part, damage, world, now);
  humanoid.remember(
    `You ${verb.past} ${result.target.character.name}'s ${part}.`,
  );
  if (!result.target.dead) {
    result.target.remember(
      `${humanoid.character.name} ${verb.past} your ${part}!`,
    );
    result.target.nextThinkAt = Math.min(result.target.nextThinkAt, now + 500);
  }
  logEmote(
    `${humanoid.character.name} ${verb.present} ${result.target.character.name}'s ${part}`,
    humanoid,
    result.target,
  );
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
        roomOf(other.x, other.y) === room,
    )
    .map((other) => other.character.name);
}

// everything a humanoid can head to right now: doors out of the room, plus
// everyone currently in the room
export function destinations(humanoid: Humanoid, world: Humanoid[]): string[] {
  const room = roomOf(humanoid.x, humanoid.y);
  const roommates = world
    .filter((other) => other !== humanoid && roomOf(other.x, other.y) === room)
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
