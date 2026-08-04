# Routed ICL voice assets

These assets are a portable copy of the hackathon routed-ICL voice packs.
Each voice directory contains its exact emotion reference WAVs, transcripts,
per-sample embeddings, and neutral mean embedding. Embeddings are JSON float
arrays so the Bun backend can load them without Python or PyTorch.

Regenerate them with `scripts/import-routed-icl-assets.py` using a Python
environment that has PyTorch installed.
