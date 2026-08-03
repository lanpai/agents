"""Turn a character's walk / stab / stabbed MP4s into sprite sheets.

The source clips are 768x768 on a pure black background at 24fps. Two kinds of
performance live in them:

  walk     loops on a ~24-frame cycle, but doesn't start on the loop point and
           drifts around inside the frame
  stab     one-shot: idle, draw the blade, swing, recover
  stabbed  one-shot: idle, reel, collapse, and hold the body on the floor

So the sampling differs per action, but the *framing* must not: all three sheets
for a character share one cell geometry, or the figure changes size the moment
it stops walking.

    python scripts/make_sprite_sheet.py \
        --input  <dir with NAME_{walk,stab,stabbed}_{front,back,left,right}.mp4> \
        --name   cory --output-dir public

Rows are front, back, left, right; columns are the four poses.
"""

import argparse
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import label

DIRECTIONS = ["front", "back", "left", "right"]
# how each action is sampled: a cycle to loop, or a performance to play once
ACTIONS = {"walk": "loop", "stab": "oneshot", "stabbed": "oneshot"}
BACKGROUND_MAX = 10  # a pixel this dark, reachable from the border, is background
SUBJECT_MIN = 24  # luma above this counts as subject when scouting
HEAD_BAND = 0.28  # top slice of the figure used as the horizontal anchor
FEET_ROW = 0.94  # where a standing figure's feet sit within the cell
SOURCE_FPS = 24
# a one-shot freezes the room until it finishes, and the source clips linger
# (the blade is held for seconds); play them no slower than a walk pose
MAX_ONESHOT_MS = 250
WALK_UNITS = 36  # SPRITE_SIZE in src/humanoid.ts — the walk sheet's world size


def find_ffmpeg() -> str:
    found = shutil.which("ffmpeg")
    if found:
        return found
    # winget installs outside the PATH of an already-running shell
    packages = Path.home() / "AppData/Local/Microsoft/WinGet/Packages"
    for candidate in packages.glob("Gyan.FFmpeg*/**/bin/ffmpeg.exe"):
        return str(candidate)
    sys.exit("ffmpeg not found — install it or put it on PATH")


def extract(ffmpeg: str, video: Path, out_dir: Path, select: str | None = None,
            scale: int | None = None):
    out_dir.mkdir(parents=True, exist_ok=True)
    filters = []
    if select:
        filters.append(f"select='{select}'")
    if scale:
        filters.append(f"scale={scale}:{scale}")
    command = [ffmpeg, "-y", "-v", "error", "-i", str(video)]
    if filters:
        command += ["-vf", ",".join(filters), "-vsync", "0"]
    command.append(str(out_dir / "%03d.png"))
    subprocess.run(command, check=True)
    return sorted(out_dir.glob("*.png"))


def find_cycle(frames: np.ndarray) -> tuple[int, int]:
    """The (start, period) at which a looping clip best repeats itself."""
    f = frames.astype(np.int32)
    n = len(f)
    best = (float("inf"), 0, 24)
    for period in range(16, 40):
        for start in range(0, min(40, n - period - 8)):
            span = min(period, n - start - period)
            if span < 8:
                continue
            distance = np.abs(f[start:start + span] - f[start + period:start + period + span]).mean()
            if distance < best[0]:
                best = (float(distance), start, period)
    _, start, period = best
    return start, period


def contact_phase(frames: np.ndarray, start: int, period: int) -> int:
    """The frame in a walk cycle where the legs are widest apart.

    A four-pose walk reads as contact / pass / opposite contact / pass. Sampling
    from an arbitrary phase lands between those poses and the loop stutters.
    """
    spreads = []
    for i in range(period):
        frame = frames[(start + i) % len(frames)]
        solid = frame.max(axis=2) > SUBJECT_MIN
        ys = np.where(solid.any(axis=1))[0]
        if len(ys) == 0:
            spreads.append(0)
            continue
        legs = solid[ys.min() + int((ys.max() - ys.min()) * 0.75):]
        xs = np.where(legs.any(axis=0))[0]
        spreads.append(int(xs.max() - xs.min() + 1) if len(xs) else 0)
    return start + int(np.argmax(spreads))


def action_span(frames: np.ndarray) -> tuple[int, int]:
    """First and last frame of the moving part of a one-shot clip.

    These clips open and close on a held pose; only the middle is the
    performance, and the last moving frame is the one worth keeping (the body
    on the floor, the blade back at rest).
    """
    f = frames.astype(np.int32)
    motion = np.abs(np.diff(f, axis=0)).mean(axis=(1, 2, 3))
    threshold = motion.min() + (motion.max() - motion.min()) * 0.12
    active = np.where(motion > threshold)[0]
    if len(active) == 0:
        return 0, len(frames) - 1
    # +1 because motion[i] describes the step from frame i to i+1
    return int(active.min()), int(active.max() + 1)


def background_mask(rgb: np.ndarray) -> np.ndarray:
    """True where the pixel is background: dark *and* connected to the border.

    Brightness alone won't do it — these characters have black hair and black
    clothing, and a plain threshold eats straight through them.
    """
    dark = rgb.max(axis=2) <= BACKGROUND_MAX
    labels, count = label(dark)
    if count == 0:
        return dark
    # every dark blob that touches an edge is outside the figure; anything else
    # (the gap between the legs once it closes, say) belongs to the character
    touching = set(labels[0].tolist()) | set(labels[-1].tolist())
    touching |= set(labels[:, 0].tolist()) | set(labels[:, -1].tolist())
    touching.discard(0)
    return np.isin(labels, list(touching))


def cut_out(path: Path) -> np.ndarray:
    rgb = np.asarray(Image.open(path).convert("RGB"))
    alpha = np.where(background_mask(rgb), 0, 255).astype(np.uint8)
    return np.dstack([rgb, alpha])


def bounds(rgba: np.ndarray) -> tuple[int, int, int, int]:
    ys, xs = np.where(rgba[:, :, 3] > 0)
    return int(ys.min()), int(ys.max()), int(xs.min()), int(xs.max())


def standing_anchor(rgba: np.ndarray) -> tuple[float, int]:
    """Head centre-x and feet-y of a figure that is still on its feet."""
    solid = rgba[:, :, 3] > 0
    top, bottom, _, _ = bounds(rgba)
    # the head barely moves during a walk cycle; the silhouette's overall centre
    # swings with the arms and legs, which is what makes sheets jitter
    band = solid[top:top + max(1, int((bottom - top) * HEAD_BAND))]
    band_xs = np.where(band.any(axis=0))[0]
    return float((band_xs.min() + band_xs.max()) / 2), bottom


def sample_frames(scout: np.ndarray, kind: str, count: int) -> tuple[list[int], float]:
    """Which frames to keep, and how long each pose is held in seconds."""
    if kind == "loop":
        loop_start, period = find_cycle(scout)
        start = contact_phase(scout, loop_start, period)
        picks = [(start + round(i * period / count)) % len(scout) for i in range(count)]
        return picks, period / count / SOURCE_FPS
    start, end = action_span(scout)
    # a one-shot keeps both ends: the wind-up and the pose it settles into
    picks = [start + round(i * (end - start) / (count - 1)) for i in range(count)]
    return picks, (end - start) / (count - 1) / SOURCE_FPS


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path,
                        help="directory holding one character's clips")
    parser.add_argument("--name", required=True, help="output file prefix, e.g. cory")
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--cell", type=int, default=96, help="cell size in px")
    parser.add_argument("--frames", type=int, default=4, help="poses per direction")
    args = parser.parse_args()

    ffmpeg = find_ffmpeg()
    temp = Path(tempfile.mkdtemp(prefix="sheet-"))
    try:
        # (action, direction) -> the four cut-out poses, in playback order
        poses: dict[tuple[str, str], list[np.ndarray]] = {}
        hold: dict[str, float] = {}

        for action, kind in ACTIONS.items():
            holds = []
            for direction in DIRECTIONS:
                matches = list(args.input.glob(f"*_{action}_{direction}.mp4"))
                if not matches:
                    continue
                video = matches[0]
                scout_paths = extract(ffmpeg, video, temp / f"scout-{action}-{direction}",
                                      scale=192)
                scout = np.stack([np.asarray(Image.open(p).convert("RGB")) for p in scout_paths])
                picks, seconds = sample_frames(scout, kind, args.frames)
                holds.append(seconds)

                select = "+".join(f"eq(n\\,{n})" for n in sorted(set(picks)))
                full = extract(ffmpeg, video, temp / f"{action}-{direction}", select=select)
                # ffmpeg emits frames in stream order; put them back in play order
                by_index = dict(zip(sorted(set(picks)), full))
                poses[(action, direction)] = [cut_out(by_index[n]) for n in picks]
                print(f"{action}/{direction}: frames {picks}")
            if holds:
                # one playback rate per action, taken from the middle of the pack
                hold[action] = sorted(holds)[len(holds) // 2]

        if not poses:
            sys.exit(f"no clips found in {args.input}")

        # every pose is placed against the standing anchor of the first pose in
        # its clip: for a walk that re-anchors each frame to kill the drift, for
        # a one-shot only the opening pose is on its feet, so the collapse stays
        # a collapse instead of being dragged back upright
        placements: dict[tuple[str, str], list[tuple[float, int]]] = {}
        for (action, direction), frames in poses.items():
            if ACTIONS[action] == "loop":
                placements[(action, direction)] = [standing_anchor(f) for f in frames]
            else:
                opening = standing_anchor(frames[0])
                placements[(action, direction)] = [opening] * len(frames)

        # each action gets the smallest square that holds it — a body on the
        # floor is far wider than a standing one, and forcing every sheet to the
        # widest would shrink the walking figure. The scale stays identical
        # because the game draws each sheet at a size scaled by the same ratio.
        sides: dict[str, int] = {}
        for action in hold:
            widest = tallest = 0.0
            for (act, direction), frames in poses.items():
                if act != action:
                    continue
                for frame, (anchor_x, feet_y) in zip(frames, placements[(act, direction)]):
                    top, bottom, left, right = bounds(frame)
                    widest = max(widest, anchor_x - left, right - anchor_x)
                    tallest = max(tallest, feet_y - top, (bottom - feet_y) / (1 - FEET_ROW))
            sides[action] = int(np.ceil(max(2 * widest, tallest / FEET_ROW)))
        reference = sides.get("walk") or next(iter(sides.values()))

        cell = args.cell
        args.output_dir.mkdir(parents=True, exist_ok=True)
        for action in hold:
            side = sides[action]
            sheet = Image.new("RGBA", (cell * args.frames, cell * len(DIRECTIONS)),
                              (0, 0, 0, 0))
            for row, direction in enumerate(DIRECTIONS):
                frames = poses.get((action, direction))
                if not frames:
                    continue
                for column, (frame, (anchor_x, feet_y)) in enumerate(
                    zip(frames, placements[(action, direction)])
                ):
                    x0 = int(round(anchor_x - side / 2))
                    y0 = int(round(feet_y - side * FEET_ROW))
                    window = np.zeros((side, side, 4), dtype=np.uint8)
                    # the window can hang off the source frame; clamp and pad
                    sy0, sx0 = max(y0, 0), max(x0, 0)
                    sy1 = min(y0 + side, frame.shape[0])
                    sx1 = min(x0 + side, frame.shape[1])
                    window[sy0 - y0:sy1 - y0, sx0 - x0:sx1 - x0] = frame[sy0:sy1, sx0:sx1]
                    image = Image.fromarray(window).resize((cell, cell), Image.LANCZOS)
                    # binary alpha: soft edges read as grime once the canvas
                    # scales the sheet down with smoothing off
                    pixels = np.asarray(image).copy()
                    pixels[:, :, 3] = np.where(pixels[:, :, 3] > 128, 255, 0)
                    sheet.paste(Image.fromarray(pixels), (column * cell, row * cell))

            out = args.output_dir / f"{args.name}_{action}.png"
            sheet.save(out)
            frame_ms = round(hold[action] * 1000)
            if ACTIONS[action] == "oneshot":
                frame_ms = min(frame_ms, MAX_ONESHOT_MS)
            units = round(WALK_UNITS * side / reference, 1)
            print(f"wrote {out} — {side}px cell, frameMs {frame_ms}, size {units}")
    finally:
        shutil.rmtree(temp, ignore_errors=True)


if __name__ == "__main__":
    main()
