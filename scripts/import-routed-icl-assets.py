#!/usr/bin/env python3
"""Import routed-ICL manifests, WAVs, and PyTorch embeddings for the game.

Run with a Python environment that has torch installed. The output contains
plain JSON embeddings, so the game backend itself does not need Python/torch.
"""

from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path

import torch


DEFAULT_SOURCE = Path(
    "/raid/niji-chess/dev-jerry/Qwen3-TTS/ignore/hackathon_2026"
)
DEFAULT_DESTINATION = Path(__file__).resolve().parents[1] / "assets" / "routed-icl"


def embedding_to_json(source: Path, destination: Path) -> None:
    tensor = torch.load(source, map_location="cpu", weights_only=True)
    values = tensor.float().reshape(-1).tolist()
    destination.write_text(
        json.dumps(values, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )


def import_character(source: Path, destination: Path) -> None:
    manifest = json.loads((source / "manifest.json").read_text(encoding="utf-8"))
    destination.mkdir(parents=True, exist_ok=True)

    mean_source = source / manifest["speaker_embedding_mean_file"]
    mean_name = "speaker_embedding_mean.json"
    embedding_to_json(mean_source, destination / mean_name)
    manifest["speaker_embedding_mean_file"] = mean_name

    for clip in manifest["clips"]:
        wav_source = source / clip["file"]
        shutil.copy2(wav_source, destination / wav_source.name)
        embedding_name = f"{wav_source.stem}.speaker_embedding.json"
        embedding_to_json(
            wav_source.with_suffix(".speaker_embedding.pt"),
            destination / embedding_name,
        )
        clip["speaker_embedding_file"] = embedding_name

    (destination / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--destination", type=Path, default=DEFAULT_DESTINATION)
    args = parser.parse_args()

    manifests = sorted(args.source.glob("*/manifest.json"))
    if not manifests:
        raise SystemExit(f"No routed-ICL manifests found under {args.source}")
    for manifest in manifests:
        import_character(manifest.parent, args.destination / manifest.parent.name)
    print(f"Imported {len(manifests)} routed voices into {args.destination}")


if __name__ == "__main__":
    main()
