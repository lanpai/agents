// zoom = screen px per world px; one world unit = one sprite pixel
export const camera = { x: 0, y: 0, zoom: 1 };

const FOCUS_ZOOM = 3.5;

// while true (sidebar closed), the camera glides to wherever events happen;
// manual input takes over momentarily until the next event
let autoFollow = true;

// live references (e.g. Humanoids): the target point is re-read every frame,
// so the camera tracks actors as they move rather than their starting spot.
// `speaking` (when the point is a Humanoid) keeps the shot locked on a talker.
type FocusPoint = { x: number; y: number; speaking?: boolean };
type Focus = { points: FocusPoint[]; zoom: number };

let focusTarget: Focus | null = null;
// the newest focus request that arrived while the shot was locked on a talker
let pendingFocus: Focus | null = null;

export function setCameraAutoFollow(enabled: boolean) {
  autoFollow = enabled;
  if (!enabled) {
    focusTarget = null;
    pendingFocus = null;
  }
}

// the shot is held while any currently-framed actor is still speaking
function focusLocked(): boolean {
  return focusTarget?.points.some((point) => point.speaking) ?? false;
}

export function focusCamera(points: FocusPoint[], zoom = FOCUS_ZOOM) {
  if (!autoFollow || points.length === 0) return;
  if (focusLocked()) {
    pendingFocus = { points, zoom }; // cut there once the line finishes
    return;
  }
  focusTarget = { points, zoom };
}

// exponential glide toward the focus target; runs on wall time so the camera
// keeps moving even while the sim itself is frozen (thinking, speech)
export function updateCamera(dt: number) {
  if (pendingFocus && !focusLocked()) {
    focusTarget = pendingFocus;
    pendingFocus = null;
  }
  if (!focusTarget) return;
  const { points, zoom } = focusTarget;
  const x = points.reduce((sum, point) => sum + point.x, 0) / points.length;
  const y = points.reduce((sum, point) => sum + point.y, 0) / points.length;
  const rate = 1 - Math.exp(-dt * 3);
  camera.x += (x - camera.x) * rate;
  camera.y += (y - camera.y) * rate;
  camera.zoom += (zoom - camera.zoom) * rate;
}

export function screenToWorld(point: { x: number; y: number }) {
  return {
    x: camera.x + (point.x - window.innerWidth / 2) / camera.zoom,
    y: camera.y + (point.y - window.innerHeight / 2) / camera.zoom,
  };
}

export function worldToScreen(point: { x: number; y: number }) {
  return {
    x: (point.x - camera.x) * camera.zoom + window.innerWidth / 2,
    y: (point.y - camera.y) * camera.zoom + window.innerHeight / 2,
  };
}

function zoomTo(screenX: number, screenY: number, zoom: number) {
  const clamped = Math.min(Math.max(zoom, 0.25), 64);
  const offsetX = screenX - window.innerWidth / 2;
  const offsetY = screenY - window.innerHeight / 2;
  const worldX = camera.x + offsetX / camera.zoom;
  const worldY = camera.y + offsetY / camera.zoom;
  camera.zoom = clamped;
  camera.x = worldX - offsetX / camera.zoom;
  camera.y = worldY - offsetY / camera.zoom;
}

function isTrackpadPan(e: WheelEvent): boolean {
  if (e.deltaMode !== WheelEvent.DOM_DELTA_PIXEL) return false; // line/page steps only come from mouse wheels
  if (e.deltaX !== 0) return true;
  // macOS trackpads report wheelDeltaY locked to exactly -3x deltaY; mouse wheels don't
  const wheelDeltaY = (e as WheelEvent & { wheelDeltaY?: number }).wheelDeltaY;
  if (typeof wheelDeltaY === "number") return wheelDeltaY === -3 * e.deltaY;
  return Math.abs(e.deltaY) < 40;
}

// Safari reports trackpad pinches via proprietary gesture events instead of ctrl+wheel
type GestureEvent = Event & { scale: number; clientX: number; clientY: number };

export function initCameraControls(canvas: HTMLCanvasElement) {
  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      focusTarget = null; // manual input wins until the next event
      pendingFocus = null;
      if (e.ctrlKey) {
        // trackpad pinch (Chrome/Firefox report it as ctrl+wheel), or explicit ctrl+scroll
        zoomTo(e.clientX, e.clientY, camera.zoom * Math.exp(-e.deltaY * 0.01));
      } else if (isTrackpadPan(e)) {
        camera.x += e.deltaX / camera.zoom;
        camera.y += e.deltaY / camera.zoom;
      } else {
        zoomTo(e.clientX, e.clientY, camera.zoom * Math.exp(-e.deltaY * 0.002));
      }
    },
    { passive: false },
  );

  let gestureStartZoom = 1;
  canvas.addEventListener("gesturestart", ((e: GestureEvent) => {
    e.preventDefault();
    focusTarget = null;
    pendingFocus = null;
    gestureStartZoom = camera.zoom;
  }) as EventListener);
  canvas.addEventListener("gesturechange", ((e: GestureEvent) => {
    e.preventDefault();
    zoomTo(e.clientX, e.clientY, gestureStartZoom * e.scale);
  }) as EventListener);

  let panFrom: { x: number; y: number } | null = null;

  canvas.addEventListener("pointerdown", (e) => {
    if (e.button !== 1) return;
    e.preventDefault();
    focusTarget = null;
    pendingFocus = null;
    canvas.setPointerCapture(e.pointerId);
    panFrom = { x: e.clientX, y: e.clientY };
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!panFrom) return;
    camera.x -= (e.clientX - panFrom.x) / camera.zoom;
    camera.y -= (e.clientY - panFrom.y) / camera.zoom;
    panFrom = { x: e.clientX, y: e.clientY };
  });
  canvas.addEventListener("pointerup", (e) => {
    if (e.button === 1) panFrom = null;
  });
  canvas.addEventListener("pointercancel", () => {
    panFrom = null;
  });
}
