// audience voting, game side: on load the game announces the round (the
// cast, and who the killer secretly is) to the server, and later the moment
// the killer goes for the kill. Viewers guess from /vote.html on their
// phones. This module also polls the live tally and draws it as the
// on-screen suspect board.

import qrcode from "qrcode-generator";
import { characterByName } from "./characters";
import { isCutscenePlaying, type Shot } from "./cutscene";
import type { Humanoid } from "./humanoid";

const POLL_MS = 3000;

let started = false;
let tally: Record<string, number> = {};
let ended = false;
let killerHumanoid: Humanoid | null = null;

export function initVoting(humanoids: Humanoid[]) {
  const killer = humanoids.find((humanoid) =>
    humanoid.statuses.has("Murderous Intent"),
  );
  if (!killer) return; // no killer, no game
  started = true;
  killerHumanoid = killer;
  fetch("/api/vote/setup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      cast: humanoids.map((humanoid) => humanoid.character.name),
      killer: killer.character.name,
    }),
  })
    .then(() => {
      // a save where somebody already died loads past the reveal
      if (humanoids.some((humanoid) => humanoid.dead)) reportKill();
    })
    .catch(() => {});

  const poll = async () => {
    try {
      const response = await fetch("/api/vote/state");
      const state = (await response.json()) as {
        active: boolean;
        tally?: Record<string, number>;
        ended?: boolean;
      };
      if (state.active) {
        tally = state.tally ?? {};
        ended = state.ended === true;
      }
    } catch {
      // server briefly away — keep the last board
    }
  };
  void poll();
  setInterval(() => void poll(), POLL_MS);
}

// the killer went for the kill, so guessing is over. The server ignores
// repeats, so callers don't need to dedupe.
export function reportKill(): Promise<unknown> {
  if (!started) return Promise.resolve();
  return fetch("/api/vote/kill", { method: "POST" }).catch(() => {});
}

// the first actual kill plays a reveal: a shot naming the killer, then the
// audience's top detectives. The stab scene claims these shots and appends
// them to its OWN cutscene, so the camera never pops back to the sim
// between the kill and the reveal.
const REVEAL_KILLER_S = 3.2;
const REVEAL_BOARD_S = 6;
export const REVEAL_TOTAL_MS = (REVEAL_KILLER_S + REVEAL_BOARD_S) * 1000;
let revealClaimed = false;

// whether a kill right now would come with the reveal — lets the stab scene
// reserve enough queue time before it knows how the blow lands
export function revealAvailable(): boolean {
  return started && !revealClaimed && killerHumanoid !== null;
}

// claim the reveal (strictly once): closes the vote, starts fetching the
// final standings, and returns the shots. The board fills in as the results
// arrive — drawCutscene reads it live, and it lands long before the shot.
export function claimRevealShots(): Shot[] | null {
  if (!revealAvailable()) return null;
  revealClaimed = true;
  const killer = killerHumanoid!;

  const board: { name: string; points: number }[] = [];
  void reportKill()
    .then(() => fetch("/api/vote/state"))
    .then((response) => response.json())
    .then((state: { results?: { user: string; points: number }[] | null }) => {
      if (Array.isArray(state?.results)) {
        board.push(
          ...state.results
            .slice(0, 5)
            .map((result) => ({ name: result.user, points: result.points })),
        );
      }
    })
    .catch(() => {});

  return [
    {
      x: killer.x,
      y: killer.y - 10,
      zoomFrom: 4,
      zoomTo: 5.2,
      duration: REVEAL_KILLER_S,
      label: "the killer was",
      title: killer.character.name,
    },
    {
      x: killer.x,
      y: killer.y - 10,
      zoomFrom: 3.2,
      zoomTo: 3.6,
      duration: REVEAL_BOARD_S,
      title: "top voters",
      board,
      sfx: "win", // the standings landing is the payoff for everyone who voted
    },
  ];
}

// sprite icons for the board: the front-facing idle cell of each character's
// walk sheet, shared through one Image per sheet
const iconCache = new Map<string, HTMLImageElement>();

function iconFor(name: string) {
  const character = characterByName(name);
  if (!character) return null;
  const sheet = character.sprite.walk;
  let image = iconCache.get(sheet.src);
  if (!image) {
    image = new Image();
    image.src = sheet.src;
    iconCache.set(sheet.src, image);
  }
  if (!image.complete || image.naturalWidth === 0) return null; // next frame
  return { image, cell: sheet.cell };
}

// the QR code pointing phones at the voting page, rendered once to its own
// canvas: white card with a quiet zone so it scans against the dark screen.
// location.origin makes it encode the public (e.g. ngrok) URL automatically.
let qrCanvas: HTMLCanvasElement | null = null;

function voteQr(): HTMLCanvasElement {
  if (qrCanvas) return qrCanvas;
  const qr = qrcode(0, "M"); // type 0 sizes itself to the data
  qr.addData(`${location.origin}/vote.html`);
  qr.make();
  const count = qr.getModuleCount();
  const cell = 4;
  const quiet = 3 * cell;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = count * cell + quiet * 2;
  const qctx = canvas.getContext("2d")!;
  qctx.fillStyle = "#fff";
  qctx.fillRect(0, 0, canvas.width, canvas.height);
  qctx.fillStyle = "#000";
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (qr.isDark(row, col)) {
        qctx.fillRect(quiet + col * cell, quiet + row * cell, cell, cell);
      }
    }
  }
  qrCanvas = canvas;
  return canvas;
}

// every row animates toward its place in the standings: y slides when a name
// overtakes another, scale grows as a name takes (or loses) the lead
const boardRows = new Map<string, { y: number; scale: number }>();
let boardDrawnAt = 0;

const BOARD_TOP = 16;
const rowHeight = (scale: number) => 26 + 18 * scale;

// top-right board on the game screen: who the audience currently suspects.
// No backdrop — hardsub-style white text with a black outline, the leader
// drawn bigger, everyone easing to their new spot when the standings change
export function drawVoteBoard(ctx: CanvasRenderingContext2D) {
  if (!started || isCutscenePlaying()) return;
  const order = Object.entries(tally).sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );
  if (order.length === 0) return;

  const now = performance.now();
  const dt = boardDrawnAt ? Math.min((now - boardDrawnAt) / 1000, 0.1) : 0.1;
  boardDrawnAt = now;
  const ease = 1 - Math.exp(-dt * 8);

  // the two highest distinct scores set the size tiers: everyone tied for
  // first draws full-size, everyone tied for second at half emphasis
  const first = order[0]![1];
  const second = order.find(([, count]) => count < first)?.[1] ?? 0;

  // lay out target positions, then ease every row toward its own
  let targetY = BOARD_TOP;
  const placed = order.map(([name, count]) => {
    const targetScale =
      count > 0 && count === first
        ? 1
        : count > 0 && count === second
          ? 0.5
          : 0;
    const row = boardRows.get(name) ?? { y: targetY, scale: targetScale };
    boardRows.set(name, row);
    row.y += (targetY - row.y) * ease;
    row.scale += (targetScale - row.scale) * ease;
    targetY += rowHeight(targetScale);
    return { name, count, row };
  });

  const right = window.innerWidth - 32;

  ctx.save();
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#000";

  for (const { name, count, row } of placed) {
    const left = right - 200 - 20 * row.scale;

    const scale = row.scale;
    const centerY = row.y + rowHeight(scale) / 2;
    const iconSize = 22 + 16 * scale;
    const iconColumn = 38; // the largest icon; smaller ones center inside it
    const icon = iconFor(name);
    if (icon) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(
        icon.image,
        0,
        0,
        icon.cell,
        icon.cell,
        left + (iconColumn - iconSize) / 2,
        centerY - iconSize / 2,
        iconSize,
        iconSize,
      );
    }
    ctx.textAlign = "left";
    ctx.font = `700 ${Math.round(16 + 8 * scale)}px sans-serif`;
    ctx.lineWidth = 3 + scale;
    ctx.fillStyle = "#fff";
    const nameX = left + iconColumn + 8;
    ctx.strokeText(name, nameX, centerY);
    ctx.fillText(name, nameX, centerY);

    ctx.textAlign = "center";
    ctx.font = `600 ${Math.round(16 + 8 * scale)}px sans-serif`;
    ctx.lineWidth = 3;
    ctx.fillStyle = "#c7cfdd";
    ctx.strokeText(String(count), right, centerY);
    ctx.fillText(String(count), right, centerY);
  }

  // QR to the voting page, sitting just left of the standings
  const qr = voteQr();
  const qrSize = 138;
  const qrX =
    right -
    20 -
    200 -
    Math.max(...placed.map(({ row }) => row.scale)) * 20 -
    qrSize;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(qrX, BOARD_TOP + 4, qrSize, qrSize, 14);
  ctx.clip();
  ctx.imageSmoothingEnabled = false; // keep the modules crisp
  ctx.drawImage(qr, qrX, BOARD_TOP + 4, qrSize, qrSize);
  ctx.restore();
  ctx.font = "600 14px sans-serif";
  ctx.lineWidth = 3;
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  const caption = ended ? "VOTING CLOSED" : "SCAN TO VOTE";
  ctx.strokeText(caption, qrX + qrSize / 2, BOARD_TOP + 4 + qrSize + 14);
  ctx.fillText(caption, qrX + qrSize / 2, BOARD_TOP + 4 + qrSize + 14);

  ctx.restore();
}
