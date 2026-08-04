# sim

To install dependencies:

```bash
bun install
```

To run the backend (port 3002) and UI (port 5173), in separate terminals:

```bash
bun run server
bun run dev
```

The backend defaults to Gemini Flash and expects
`GOOGLE_GENERATIVE_AI_API_KEY`. Set `AGENT_BACKEND` to `sonnet`, `k3`, or
`deepseek` to use one of the other configured providers instead. The Gemini
model can be overridden with `GEMINI_MODEL`.

Set `API_PORT` for both commands to use a different backend port.

## Qwen3-TTS

Character speech uses the Qwen3-TTS streaming server when it is available and
falls back to the browser formant synthesizer otherwise. The backend proxies
TTS so browsers only need access to the UI port.

- `QWEN_TTS_URL` defaults to `http://127.0.0.1:9001` for non-routed requests
- `QWEN_TTS_MODEL` overrides automatic `/v1/models` discovery
- `QWEN_TTS_DEFAULT_VOICE` defaults to `web_nori_v0`
- `QWEN_TTS_ALLOWED_HOSTS` adds comma-separated remote TTS hostnames; loopback
  and Tailscale IP/MagicDNS targets are allowed automatically

For a non-routed character, `voice.speakerEmbedding` can hold a model-compatible
1024- or 2048-element vector. Otherwise it uses `voice.ttsVoice`, then the
default voice above. Routed characters use the portable pack described below.

Press Tab in the UI to select the routed-compatible 8092 default, the
9001/8094 presets, or enter another local
server URL. The choice is saved per browser and applies to the next line.

### Routed character voices

Portable routed-ICL packs live under `assets/routed-icl`. Neutral lines use
that character's mean x-vector. Emotional lines use a matched reference WAV,
exact transcript, and per-sample embedding from the same manifest entry.
The dialogue model selects only from the routes available for that voice's
language; an absent or invalid route safely becomes neutral.

| Game character | Routed voice | Manifest language |
| --- | --- | --- |
| Cory | Cory | English |
| Eric | Eric | Chinese |
| Hirai | Hirai | Japanese |
| Leland | Leland | English |
| Tiffany | Tiffany | English |
| Tyler | Tyler | English |
| Yanghua | Yanghua | Chinese |
| YP | YP | English |

The routed assets can be regenerated with
`scripts/import-routed-icl-assets.py`; the running app needs neither Python nor
PyTorch because embeddings are checked in as JSON arrays.

This project was created using `bun init` in bun v1.2.23. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
