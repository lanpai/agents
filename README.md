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

- `QWEN_TTS_URL` defaults to `http://127.0.0.1:9001`
- `QWEN_TTS_MODEL` defaults to `/opt/models/qwen3-tts`
- `QWEN_TTS_DEFAULT_VOICE` defaults to `web_nori_v0`

Set `voice.speakerEmbedding` on a character to a model-compatible 1024- or
2048-element vector. Characters without one use `voice.ttsVoice`, then the
default voice above.

Press Tab in the UI to select the 9001/8094 presets or enter another local
server URL. The choice is saved per browser and applies to the next line.

This project was created using `bun init` in bun v1.2.23. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
