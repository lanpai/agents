// audience voting, game side: on load the game announces the round (just
// the cast — the killer is emergent, so nobody knows yet), and later reports
// who went for the kill and who they went for. Viewers guess both from
// /vote.html on their phones. This module also polls the live tallies and
// draws them as the on-screen suspicion boards.

import qrcode from "qrcode-generator";
import { characterByName } from "./characters";
import { isCutscenePlaying, type Shot } from "./cutscene";
import type { Humanoid } from "./humanoid";
import { ESCAPE_REVEAL_S, escapeRouteShot } from "./escapeRoute";

const POLL_MS = 3000;

type Question = "killer" | "victim";

let started = false;
let tallies: Record<Question, Record<string, number>> = {
  killer: {},
  victim: {},
};
let ended = false;
// Presentation is a one-shot independent of the server's voting state. This
// is restored from corpses on init so reloading between kills cannot make the
// next stab replay the vote board and escape-route reveal.
let revealClaimed = false;

export function initVoting(humanoids: Humanoid[]) {
  started = true;
  revealClaimed = humanoids.some((humanoid) => humanoid.dead);
  fetch("/api/vote/setup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      cast: humanoids.map((humanoid) => humanoid.character.name),
    }),
  })
    .then(() => {
      // a save where somebody already died loads past the reveal
      const victim = humanoids.find((humanoid) => humanoid.dead);
      if (victim) {
        const killer = humanoids.find((humanoid) => humanoid.hasKilled);
        reportKill(killer?.character.name ?? "", victim.character.name);
      }
    })
    .catch(() => {});

  const poll = async () => {
    try {
      const response = await fetch("/api/vote/state");
      const state = (await response.json()) as {
        active: boolean;
        tally?: Record<Question, Record<string, number>>;
        ended?: boolean;
      };
      if (state.active) {
        tallies = state.tally ?? { killer: {}, victim: {} };
        ended = state.ended === true;
      }
    } catch {
      // server briefly away — keep the last board
    }
  };
  void poll();
  setInterval(() => void poll(), POLL_MS);
}

// the killer went for the kill, so guessing is over; both answers ride along
// so the server can score the two questions. The server keeps only the first
// report, so callers don't need to dedupe.
export function reportKill(killer: string, victim: string): Promise<unknown> {
  if (!started) return Promise.resolve();
  return fetch("/api/vote/kill", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ killer, victim }),
  }).catch(() => {});
}

// the first actual kill plays a reveal: a shot naming the killer, then the
// audience's top detectives. The stab scene claims these shots and appends
// them to its OWN cutscene, so the camera never pops back to the sim
// between the kill and the reveal.
const REVEAL_KILLER_S = 3.2;
const REVEAL_BOARD_S = 6;
export const REVEAL_TOTAL_MS =
  (REVEAL_KILLER_S + REVEAL_BOARD_S + ESCAPE_REVEAL_S) * 1000;

// whether a kill right now would come with the reveal — lets the stab scene
// reserve enough queue time before it knows how the blow lands
export function revealAvailable(): boolean {
  return started && !revealClaimed;
}

// claim the reveal (strictly once): closes the vote with both answers,
// starts fetching the final standings, and returns the shots. The board
// fills in as the results arrive — drawCutscene reads it live, and it lands
// long before the shot.
export function claimRevealShots(
  killer: Humanoid,
  victim: Humanoid,
): Shot[] | null {
  if (!revealAvailable()) return null;
  revealClaimed = true;

  const board: { name: string; points: number }[] = [];
  void reportKill(killer.character.name, victim.character.name)
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

  const shots: Shot[] = [
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
  const escape = escapeRouteShot();
  if (escape) shots.push(escape);
  return shots;
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
// overtakes another, scale grows as a name takes (or loses) the lead. One
// map per question, since the same name sits at different spots on each.
const boardRows: Record<Question, Map<string, { y: number; scale: number }>> =
  { killer: new Map(), victim: new Map() };
let boardDrawnAt = 0;

const BOARD_TOP = 16;
const SECTION_GAP = 22;
const HEADER_H = 24;
const rowHeight = (scale: number) => 26 + 18 * scale;

// one question's standings; returns the y below it and its widest row scale
function drawBoardSection(
  ctx: CanvasRenderingContext2D,
  question: Question,
  header: string,
  top: number,
  right: number,
  ease: number,
): { bottom: number; maxScale: number } {
  const order = Object.entries(tallies[question]).sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );
  if (order.length === 0) return { bottom: top, maxScale: 0 };

  // the two highest distinct scores set the size tiers: everyone tied for
  // first draws full-size, everyone tied for second at half emphasis
  const first = order[0]![1];
  const second = order.find(([, count]) => count < first)?.[1] ?? 0;

  ctx.font = "600 13px sans-serif";
  ctx.letterSpacing = "2px"; // ignored by engines that don't support it
  ctx.lineWidth = 3;
  ctx.fillStyle = "#c7cfdd";
  ctx.textAlign = "left";
  const headerLeft = right - 200;
  ctx.strokeText(header, headerLeft, top + HEADER_H / 2);
  ctx.fillText(header, headerLeft, top + HEADER_H / 2);
  ctx.letterSpacing = "0px";

  // lay out target positions, then ease every row toward its own
  let targetY = top + HEADER_H;
  const rows = boardRows[question];
  const placed = order.map(([name, count]) => {
    const targetScale =
      count > 0 && count === first
        ? 1
        : count > 0 && count === second
          ? 0.5
          : 0;
    const row = rows.get(name) ?? { y: targetY, scale: targetScale };
    rows.set(name, row);
    row.y += (targetY - row.y) * ease;
    row.scale += (targetScale - row.scale) * ease;
    targetY += rowHeight(targetScale);
    return { name, count, row };
  });

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

  return {
    bottom: targetY,
    maxScale: Math.max(...placed.map(({ row }) => row.scale)),
  };
}

// top-right boards on the game screen: who the audience thinks the killer
// will be, and who they think dies first. No backdrop — hardsub-style white
// text with a black outline, leaders drawn bigger, rows easing to their new
// spots when the standings change
export function drawVoteBoard(ctx: CanvasRenderingContext2D) {
  if (!started || isCutscenePlaying()) return;

  const now = performance.now();
  const dt = boardDrawnAt ? Math.min((now - boardDrawnAt) / 1000, 0.1) : 0.1;
  boardDrawnAt = now;
  const ease = 1 - Math.exp(-dt * 8);

  const right = window.innerWidth - 32;

  ctx.save();
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#000";

  const killerBoard = drawBoardSection(
    ctx,
    "killer",
    "THE KILLER?",
    BOARD_TOP,
    right,
    ease,
  );
  const victimBoard = drawBoardSection(
    ctx,
    "victim",
    "FIRST VICTIM?",
    killerBoard.bottom + SECTION_GAP,
    right,
    ease,
  );
  if (killerBoard.bottom === BOARD_TOP) {
    ctx.restore();
    return; // no round data yet — nothing to hang the QR next to either
  }

  // QR to the voting page, sitting just left of the standings
  const qr = voteQr();
  const qrSize = 138;
  const qrX =
    right -
    20 -
    200 -
    Math.max(killerBoard.maxScale, victimBoard.maxScale) * 20 -
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
