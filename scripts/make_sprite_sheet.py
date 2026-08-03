"""Turn a character's four walk MP4s into one sprite sheet.

The source clips are 768x768 on a pure black background, 24fps, and hold a
24-frame (1.0s) walk cycle — but they don't start on the loop point, and the
character drifts around inside the frame. So this does three things:

  1. finds where the clip actually repeats, and samples one cycle from there
  2. keys out the background by flood fill, not by brightness (the characters
     have black hair and black clothing)
  3. anchors every pose on the head's centre line and the feet, so the figure
     doesn't slide around inside its cell

Rows are front, back, left, right; columns are the four poses.

    python scripts/make_sprite_sheet.py \
        --input  <dir with *_walk_{front,back,left,right}.mp4> \
        --output public/cory_walk.png
"""

import argparse
import shutil
import subprocess
import sys
import tempfile
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

DIRECTIONS = ["front", "back", "left", "right"]
BACKGROUND_MAX = 10  # a pixel this dark, reachable from the border, is background
SUBJECT_MIN = 24  # luma above this counts as subject when scouting the cycle
HEAD_BAND = 0.28  # top slice of the figure used as the horizontal anchor
FEET_ROW = 0.94  # where the feet sit in the cell, as a fraction of its height


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
    """The (start, period) at which the clip best repeats itself."""
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
    """The frame in the cycle where the legs are widest apart.

    A four-pose walk reads as contact / pass / opposite contact / pass. Sampling
    from an arbitrary phase lands between those poses and the loop looks like it
    stutters, so the cycle is anchored on a contact frame.
    """
    spreads = []
    for i in range(period):
        frame = frames[(start + i) % len(frames)]
        solid = frame.max(axis=2) > SUBJECT_MIN
        ys = np.where(solid.any(axis=1))[0]
        if len(ys) == 0:
            spreads.append(0)
            continue
        # just the legs: the bottom quarter of the figure
        legs = solid[ys.min() + int((ys.max() - ys.min()) * 0.75):]
        xs = np.where(legs.any(axis=0))[0]
        spreads.append(int(xs.max() - xs.min() + 1) if len(xs) else 0)
    return start + int(np.argmax(spreads))


def background_mask(rgb: np.ndarray) -> np.ndarray:
    """True where the pixel is background: dark *and* connected to the border."""
    dark = rgb.max(axis=2) <= BACKGROUND_MAX
    height, width = dark.shape
    seen = np.zeros_like(dark)
    queue = deque()

    def push(y, x):
        if dark[y, x] and not seen[y, x]:
            seen[y, x] = True
            queue.append((y, x))

    for x in range(width):
        push(0, x)
        push(height - 1, x)
    for y in range(height):
        push(y, 0)
        push(y, width - 1)
    while queue:
        y, x = queue.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < height and 0 <= nx < width:
                push(ny, nx)
    return seen


def cut_out(path: Path) -> np.ndarray:
    rgb = np.asarray(Image.open(path).convert("RGB"))
    alpha = np.where(background_mask(rgb), 0, 255).astype(np.uint8)
    return np.dstack([rgb, alpha])


def anchor_of(rgba: np.ndarray) -> tuple[float, int, int, int, int]:
    """Head centre-x and feet-y, plus the figure's bounds."""
    solid = rgba[:, :, 3] > 0
    ys, xs = np.where(solid)
    top, bottom, left, right = ys.min(), ys.max(), xs.min(), xs.max()
    # the head barely moves during a walk cycle; the silhouette's overall centre
    # swings with the arms and legs, which is what made the old sheet jitter
    band = solid[top:top + max(1, int((bottom - top) * HEAD_BAND))]
    band_xs = np.where(band.any(axis=0))[0]
    return float((band_xs.min() + band_xs.max()) / 2), int(bottom), int(top), int(left), int(right)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path,
                        help="directory holding *_walk_front.mp4 and friends")
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--cell", type=int, default=96, help="cell size in px")
    parser.add_argument("--frames", type=int, default=4, help="poses per direction")
    parser.add_argument("--offset", type=int, default=None,
                        help="force the first frame of the cycle (default: detect)")
    args = parser.parse_args()

    ffmpeg = find_ffmpeg()
    temp = Path(tempfile.mkdtemp(prefix="sheet-"))
    fps = None
    try:
        # scouting pass: small frames are plenty for finding the loop point
        scouts: dict[str, tuple[np.ndarray, Path, int, int, int]] = {}
        for direction in DIRECTIONS:
            matches = list(args.input.glob(f"*_walk_{direction}.mp4"))
            if not matches:
                sys.exit(f"no *_walk_{direction}.mp4 in {args.input}")
            video = matches[0]
            scout_paths = extract(ffmpeg, video, temp / f"scout-{direction}", scale=192)
            scout = np.stack([np.asarray(Image.open(p).convert("RGB")) for p in scout_paths])
            loop_start, period = find_cycle(scout)
            scouts[direction] = (scout, video, loop_start, period, len(scout_paths))

        # these clips are generated one per direction, so their gaits don't share
        # a tempo. Each row is sampled over its own cycle — otherwise a row whose
        # cycle is shorter gets sampled past its loop and stutters — while the
        # game plays every row at one rate, taken from the middle of the pack.
        periods = sorted(entry[3] for entry in scouts.values())
        fps = periods[len(periods) // 2]
        if len(set(periods)) > 1:
            print(f"periods per direction {periods} -> playback uses {fps}")

        poses: dict[str, list[np.ndarray]] = {}
        for direction in DIRECTIONS:
            scout, video, loop_start, period, total = scouts[direction]
            start = (
                args.offset
                if args.offset is not None
                else contact_phase(scout, loop_start, period)
            )
            wanted = [start + round(i * period / args.frames) for i in range(args.frames)]
            # a contact frame late in the clip can run the sampling past the end
            wanted = [n % total for n in wanted]
            select = "+".join(f"eq(n\\,{n})" for n in sorted(set(wanted)))
            full = extract(ffmpeg, video, temp / direction, select=select)
            # ffmpeg emits frames in stream order; put them back in cycle order
            by_index = dict(zip(sorted(set(wanted)), full))
            poses[direction] = [cut_out(by_index[n]) for n in wanted]
            print(f"{direction}: loop at {loop_start}, contact at {start} -> frames {wanted}")

        # one shared cell geometry for every pose, so scale and ground line hold
        # steady when the character turns
        metrics = {d: [anchor_of(p) for p in frames] for d, frames in poses.items()}
        flat = [m for values in metrics.values() for m in values]
        side = max(
            2 * max(max(ax - left, right - ax) for ax, _, _, left, right in flat),
            (max(bottom - top for _, bottom, top, _, _ in flat) + 8) / FEET_ROW,
        )
        side = int(np.ceil(side))
        print(f"cell geometry: {side}px square, feet at {FEET_ROW:.0%} of the cell")

        cell = args.cell
        sheet = Image.new("RGBA", (cell * args.frames, cell * len(DIRECTIONS)), (0, 0, 0, 0))
        for row, direction in enumerate(DIRECTIONS):
            for column, (frame, metric) in enumerate(zip(poses[direction], metrics[direction])):
                anchor_x, feet_y = metric[0], metric[1]
                x0 = int(round(anchor_x - side / 2))
                y0 = int(round(feet_y - side * FEET_ROW))
                window = np.zeros((side, side, 4), dtype=np.uint8)
                # the window can hang off the source frame; clamp and pad
                sy0, sx0 = max(y0, 0), max(x0, 0)
                sy1, sx1 = min(y0 + side, frame.shape[0]), min(x0 + side, frame.shape[1])
                window[sy0 - y0:sy1 - y0, sx0 - x0:sx1 - x0] = frame[sy0:sy1, sx0:sx1]
                image = Image.fromarray(window).resize((cell, cell), Image.LANCZOS)
                # binary alpha: soft edges read as grime once the canvas scales
                # the sheet down with smoothing off
                pixels = np.asarray(image).copy()
                pixels[:, :, 3] = np.where(pixels[:, :, 3] > 128, 255, 0)
                sheet.paste(Image.fromarray(pixels), (column * cell, row * cell))

        args.output.parent.mkdir(parents=True, exist_ok=True)
        sheet.save(args.output)
        frame_ms = round(1000 * (fps / args.frames) / 24)
        print(f"wrote {args.output} ({sheet.width}x{sheet.height})")
        print(f"source tempo: {frame_ms}ms per pose — set frameMs to this")
    finally:
        shutil.rmtree(temp, ignore_errors=True)


if __name__ == "__main__":
    main()
