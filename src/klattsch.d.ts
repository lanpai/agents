// hand-written types for the untyped klattsch package (formant speech synth)

declare module "klattsch" {
  // initial voice state for a compile; running directives in the phoneme
  // string adjust from here
  export type CompileOptions = {
    baseF0?: number;
    rate?: number;
    scale?: number;
    effort?: number;
    aspiration?: number;
    tilt?: number;
    vibratoDepth?: number;
    vibratoRate?: number;
    tremoloDepth?: number;
    tremoloRate?: number;
    bank?: string;
  };

  export type ScheduleEvent = {
    atMs: number;
    target: Record<string, number>;
    transitionMs: number;
  };

  export function compileString(
    input: string,
    opts?: CompileOptions,
  ): {
    schedule: ScheduleEvent[];
    totalMs: number;
    warnings: string[];
  };

  export const PHONEME_KEYS: string[];
}

// Vite resolves the ?url suffix to the served asset URL, for audioWorklet.addModule
declare module "klattsch/formant-worklet.js?url" {
  const url: string;
  export default url;
}
