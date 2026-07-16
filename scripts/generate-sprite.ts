// Generates public/humanoid.png (16x16) from the pixel grid below.
// Run: bun scripts/generate-sprite.ts
import { deflateSync } from "node:zlib";

// B = black, W = white, . = transparent
const GRID = [
  "................",
  ".....BBBBBB.....",
  ".....BBBBBB.....",
  ".....BWBBWB.....",
  ".....BBBBBB.....",
  ".....BBBBBB.....",
  "......BBBB......",
  "...BBBBBBBBBB...",
  "...B.BBBBBB.B...",
  "...B.BBBBBB.B...",
  "...B.BBBBBB.B...",
  ".....BBBBBB.....",
  ".....BB..BB.....",
  ".....BB..BB.....",
  ".....BB..BB.....",
  "....BBB..BBB....",
];

const COLORS: Record<string, [number, number, number, number]> = {
  B: [0, 0, 0, 255],
  W: [255, 255, 255, 255],
  ".": [0, 0, 0, 0],
};

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(new TextEncoder().encode(type), 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

function encodePng(grid: string[], scale: number): Uint8Array {
  const w = grid[0]!.length * scale;
  const h = grid.length * scale;

  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, w);
  ihdrView.setUint32(4, h);
  ihdr.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA

  const raw = new Uint8Array(h * (1 + w * 4)); // each scanline: filter byte + RGBA pixels
  for (let y = 0; y < h; y++) {
    const row = y * (1 + w * 4) + 1;
    for (let x = 0; x < w; x++) {
      const cell = grid[Math.floor(y / scale)]![Math.floor(x / scale)]!;
      raw.set(COLORS[cell]!, row + x * 4);
    }
  }

  const signature = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", new Uint8Array(0)),
  ]);
}

await Bun.write("public/humanoid.png", encodePng(GRID, 1));
await Bun.write("/tmp/humanoid-preview.png", encodePng(GRID, 16));
console.log("wrote public/humanoid.png (16x16) and /tmp/humanoid-preview.png (256x256)");
