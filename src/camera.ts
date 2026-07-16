// zoom = screen px per world px; one world unit = one sprite pixel
export const camera = { x: 0, y: 0, zoom: 1 };

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
