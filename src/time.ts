// simulation clock, in milliseconds. It advances only while the world is
// actually running — manual pause, TTS playback, and in-flight thinking all
// freeze it — so timers like nextThinkAt never tick during a pause.
let simTime = 0;

export function simNow(): number {
  return simTime;
}

export function advanceSimTime(deltaMs: number) {
  simTime += deltaMs;
}
