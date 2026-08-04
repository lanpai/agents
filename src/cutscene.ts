import { camera } from "./camera";

// a cutscene is a sequence of held camera compositions. Each shot cuts (no
// glide) to its spot, then pushes in slowly from zoomFrom to zoomTo — the
// steady drift tv credit sequences use. While one plays, main.ts freezes the
// entire sim and hands the camera here; click or Escape skips the rest.
export type Shot = {
  x: number;
  y: number;
  zoomFrom: number;
  zoomTo: number;
  duration: number; // wall-clock seconds
  label?: string; // small kicker above the title, e.g. "starring"
  title?: string; // the big line, e.g. "CORY"
};

const TEXT_FADE_IN = 0.5;
const TEXT_FADE_OUT = 0.4;
const BARS_SLIDE = 0.9; // seconds for the letterbox bars to slide in/out
const OPEN_FADE = 1.2; // fade up from black at the very start
const BAR_HEIGHT = 0.11; // of screen height, each bar
const VIGNETTE_FADE = 1; // seconds the vignette takes to ease off at the end
const VIGNETTE_STRENGTH = 0.8;

let shots: Shot[] = [];
let index = 0;
let shotT = 0; // seconds into the current shot
let elapsed = 0; // seconds into the whole cutscene
let total = 0;
let playing = false;
let openFade = true; // fade up from black — right for the intro, wrong mid-scene

export function isCutscenePlaying(): boolean {
  return playing;
}

export function playCutscene(
  sequence: Shot[],
  options?: { openFade?: boolean },
) {
  if (playing || sequence.length === 0) return;
  // a shot whose duration is NaN or non-positive never advances: `shotT >= NaN`
  // is false, so the while-loop below never fires and the cutscene runs forever
  // — and a cutscene freezes every room, which reads as the whole game hanging
  shots = sequence.map((shot) =>
    Number.isFinite(shot.duration) && shot.duration > 0
      ? shot
      : { ...shot, duration: 2 },
  );
  index = 0;
  shotT = 0;
  elapsed = 0;
  total = sequence.reduce((sum, shot) => sum + shot.duration, 0);
  openFade = options?.openFade ?? true;
  playing = true;
  window.addEventListener("keydown", skipOnEscape, true);
  applyCamera(); // cut to the first shot before the next frame draws
}

function endCutscene() {
  playing = false;
  window.removeEventListener("keydown", skipOnEscape, true);
}

function skipOnEscape(event: KeyboardEvent) {
  if (event.key !== "Escape") return;
  event.stopPropagation();
  endCutscene();
}

// ticks on wall time and drives the camera directly; main.ts skips
// updateCamera while a cutscene plays so the two never fight over the shot
export function updateCutscene(dt: number) {
  if (!playing) return;
  shotT += dt;
  elapsed += dt;
  // backstop: however the per-shot arithmetic goes wrong, the world does not
  // stay frozen past the sequence's own length
  if (elapsed > total + 2) {
    endCutscene();
    return;
  }
  while (shotT >= shots[index]!.duration) {
    shotT -= shots[index]!.duration;
    index++;
    if (index >= shots.length) {
      endCutscene();
      return;
    }
  }
  applyCamera();
}

function applyCamera() {
  const shot = shots[index]!;
  const t = Math.min(shotT / shot.duration, 1);
  camera.x = shot.x;
  camera.y = shot.y;
  // exponential interpolation keeps the perceived push-in rate steady
  camera.zoom = shot.zoomFrom * Math.pow(shot.zoomTo / shot.zoomFrom, t);
}

// screen-space overlay: heavy vignette, letterbox bars, credit text, and the
// opening fade from black. Drawn last so it sits over the whole frame.
export function drawCutscene(ctx: CanvasRenderingContext2D) {
  if (!playing) return;
  const w = window.innerWidth;
  const h = window.innerHeight;
  const shot = shots[index]!;

  // much heavier than the ambient vignette: pulls the eye to the framed
  // actor; eases off over the last second so the ending doesn't pop
  const vignette =
    VIGNETTE_STRENGTH *
    Math.max(0, Math.min(1, (total - elapsed) / VIGNETTE_FADE));
  const gradient = ctx.createRadialGradient(
    w / 2,
    h / 2,
    Math.min(w, h) * 0.2,
    w / 2,
    h / 2,
    Math.hypot(w, h) / 2,
  );
  gradient.addColorStop(0, "rgba(0, 0, 0, 0)");
  gradient.addColorStop(1, `rgba(0, 0, 0, ${vignette})`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);

  // letterbox bars slide in at the start and back out at the end
  const slide = Math.max(
    0,
    Math.min(1, elapsed / BARS_SLIDE, (total - elapsed) / BARS_SLIDE),
  );
  const bar = h * BAR_HEIGHT * (1 - (1 - slide) ** 3);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, bar);
  ctx.fillRect(0, h - bar, w, bar);

  // credit text in the lower third, fading in and out with the shot
  const alpha = Math.max(
    0,
    Math.min(1, shotT / TEXT_FADE_IN, (shot.duration - shotT) / TEXT_FADE_OUT),
  );
  if (alpha > 0 && (shot.title || shot.label)) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.textAlign = "center";
    ctx.shadowColor = "rgba(0, 0, 0, 0.9)";
    ctx.shadowBlur = 12;
    ctx.letterSpacing = "6px"; // ignored by engines that don't support it
    if (shot.label) {
      ctx.font = "600 18px sans-serif";
      ctx.fillStyle = "#fff";
      ctx.fillText(shot.label.toUpperCase(), w / 2, h - bar - 64);
    }
    if (shot.title) {
      ctx.font = "bold 44px sans-serif";
      ctx.fillStyle = "#fff";
      ctx.fillText(shot.title.toUpperCase(), w / 2, h - bar - 22);
    }
    ctx.restore();
  }

  // fade up from black on the first beat
  const fade = openFade ? 1 - Math.min(1, elapsed / OPEN_FADE) : 0;
  if (fade > 0) {
    ctx.fillStyle = `rgba(0, 0, 0, ${fade})`;
    ctx.fillRect(0, 0, w, h);
  }
}
