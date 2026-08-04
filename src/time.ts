// Global simulation clock, in milliseconds. Manual pause and cutscenes stop
// calls to advanceSimTime; room-level presentation holds instead adjust each
// character's own timers in main.ts.
let simTime = 0;

export function simNow(): number {
  return simTime;
}

export function advanceSimTime(deltaMs: number) {
  simTime += deltaMs;
}
