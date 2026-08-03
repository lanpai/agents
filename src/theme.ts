// Art direction for the office: a dark top-down battlemap. Walls are heavy and
// cold, floors are warm and lit from above, and everything the sim draws on top
// (humanoids, labels, UI) has to stay legible against that darkness.

export const PALETTE = {
  // outside the building
  void: "#0e1015",
  // wall band, its outer edge, and the lit lip on the inside
  wall: "#2b3140",
  wallEdge: "#161a23",
  wallLip: "rgba(150, 170, 200, 0.16)",
  // the dark the walls cast onto the floor
  wallShadow: "rgba(0, 0, 0, 0.5)",
  // doorways read as glass, like the reference's office partitions
  doorFrame: "#6b7d92",
  doorGlass: "rgba(150, 205, 225, 0.22)",
  doorBase: "#212936",
  // warm ceiling light pooling on the floor
  light: "rgba(255, 216, 158, 0.10)",
  // room names, set like labels on an architectural plan: small and tucked into
  // the corner, but outlined so they stay readable over any floor material
  label: "#dfe6f2",
  labelShadow: "rgba(0, 0, 0, 0.8)",
  // humanoids: a light rim around the black silhouette, plus its contact shadow
  rim: "#e8e2d4",
  bodyShadow: "rgba(0, 0, 0, 0.45)",
  nameText: "#a9b2c2",
  itemText: "#e4dcc8",
  itemTextShadow: "rgba(0, 0, 0, 0.85)",
  selection: "#79d2ff",
} as const;

export type FloorMaterial =
  | "concrete"
  | "wood"
  | "tile"
  | "carpet"
  | "checker";

// deterministic noise: the texture must be identical every frame and every
// reload, so nothing here may touch Math.random
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

const TILE = 64; // world units covered by one repeat of a floor texture

function tileCanvas(): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
} {
  const canvas = document.createElement("canvas");
  canvas.width = TILE;
  canvas.height = TILE;
  return { canvas, ctx: canvas.getContext("2d")! };
}

// per-pixel grain, kept subtle — at close zoom this is what stops the floor
// from looking like flat paint
function grain(
  ctx: CanvasRenderingContext2D,
  random: () => number,
  strength: number,
) {
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const shade = random();
      if (shade > 0.72) {
        ctx.fillStyle = `rgba(255, 255, 255, ${(shade - 0.72) * strength})`;
        ctx.fillRect(x, y, 1, 1);
      } else if (shade < 0.28) {
        ctx.fillStyle = `rgba(0, 0, 0, ${(0.28 - shade) * strength})`;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }
}

function buildTile(material: FloorMaterial): HTMLCanvasElement {
  const { canvas, ctx } = tileCanvas();
  const random = mulberry32(hashSeed(material));

  if (material === "wood") {
    ctx.fillStyle = "#5d4128";
    ctx.fillRect(0, 0, TILE, TILE);
    // planks running east-west, each board a slightly different stain
    for (let y = 0; y < TILE; y += 8) {
      const tone = 0.5 + random() * 0.5;
      ctx.fillStyle = `rgba(120, 82, 48, ${0.35 * tone})`;
      ctx.fillRect(0, y, TILE, 8);
      ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
      ctx.fillRect(0, y + 7, TILE, 1);
      // staggered butt joints between boards
      const seam = Math.floor(random() * (TILE - 8)) + 4;
      ctx.fillRect(seam, y, 1, 7);
    }
    grain(ctx, random, 0.22);
  } else if (material === "tile") {
    // kitchen: pale square tile with grout
    for (let y = 0; y < TILE; y += 16) {
      for (let x = 0; x < TILE; x += 16) {
        const tone = 0.85 + random() * 0.15;
        ctx.fillStyle = `rgba(${Math.round(122 * tone)}, ${Math.round(
          128 * tone,
        )}, ${Math.round(130 * tone)}, 1)`;
        ctx.fillRect(x, y, 16, 16);
      }
    }
    ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
    for (let i = 0; i <= TILE; i += 16) {
      ctx.fillRect(i - 1, 0, 1, TILE);
      ctx.fillRect(0, i - 1, TILE, 1);
    }
    grain(ctx, random, 0.18);
  } else if (material === "carpet") {
    ctx.fillStyle = "#332f3c";
    ctx.fillRect(0, 0, TILE, TILE);
    grain(ctx, random, 0.45); // carpet is all fibre, so the grain runs hot
    // faint 32-unit carpet-tile seams
    ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
    for (let i = 0; i <= TILE; i += 32) {
      ctx.fillRect(i - 1, 0, 1, TILE);
      ctx.fillRect(0, i - 1, TILE, 1);
    }
  } else if (material === "checker") {
    // conference room rug: the reference's muted maroon check
    for (let y = 0; y < TILE; y += 16) {
      for (let x = 0; x < TILE; x += 16) {
        const dark = ((x + y) / 16) % 2 === 0;
        ctx.fillStyle = dark ? "#5a3a3a" : "#6b4747";
        ctx.fillRect(x, y, 16, 16);
      }
    }
    grain(ctx, random, 0.3);
  } else {
    // polished concrete: the reference's warm tan main floor
    ctx.fillStyle = "#6d6252";
    ctx.fillRect(0, 0, TILE, TILE);
    // broad mottling, then the faint pour seams of a poured slab
    for (let i = 0; i < 22; i++) {
      const x = random() * TILE;
      const y = random() * TILE;
      const r = 6 + random() * 16;
      const blot = ctx.createRadialGradient(x, y, 0, x, y, r);
      blot.addColorStop(0, `rgba(255, 240, 210, ${0.05 + random() * 0.05})`);
      blot.addColorStop(1, "rgba(255, 240, 210, 0)");
      ctx.fillStyle = blot;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    ctx.fillStyle = "rgba(0, 0, 0, 0.14)";
    ctx.fillRect(0, TILE - 1, TILE, 1);
    ctx.fillRect(TILE - 1, 0, 1, TILE);
    grain(ctx, random, 0.2);
  }

  return canvas;
}

const patterns = new Map<FloorMaterial, CanvasPattern>();

// patterns are filled under the camera transform, so the texture lives in world
// space: it stays pinned to the floor and scales with zoom
export function floorPattern(
  ctx: CanvasRenderingContext2D,
  material: FloorMaterial,
): CanvasPattern {
  const cached = patterns.get(material);
  if (cached) return cached;
  const pattern = ctx.createPattern(buildTile(material), "repeat")!;
  patterns.set(material, pattern);
  return pattern;
}

// a light-coloured copy of a sprite, used to rim black silhouettes so they read
// against a dark floor
export function silhouette(
  image: HTMLImageElement,
  color: string,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(image, 0, 0);
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return canvas;
}
