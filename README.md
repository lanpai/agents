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

The Tab sidebar has two spoken-language modes. `Character languages` is the
default and uses each character's native language while letting multilingual
characters match the person they are replying to: Hirai speaks Japanese; Eric
and Yanghua default to Chinese and also speak Japanese and English; Tiffany
defaults to English and also speaks Japanese and Chinese. `Presentation` asks
every character to speak English. In character mode, the available language is
restricted to languages understood by every person in earshot. Eric and
Yanghua therefore use English around English-only coworkers, Japanese with
Hirai, and Chinese only when every listener present understands Chinese. When
no shared language exists, a character continues in their native language and
listeners who do not know it remember that they could not understand.
Speech explicitly addressed to `myself` always uses the speaker's native
language, even when someone else happens to be nearby.

Routed emotional ICL references are native-language assets. Non-native speech
therefore uses the character's mean embedding and a neutral route by default.
The sidebar's experimental cross-language emotion option is enabled by default.
It reuses the native emotional reference while keeping Qwen's output language
set to the language of the generated line; an upstream rejection is retried
with the neutral mean embedding.

Each `say` and `yell` decision includes a natural written line plus a bounded
list of pronunciation substitutions in the same agent call. The runtime
constructs the spoken line from the written line, accepting substitutions only
for compact ambiguous tokens such as `5.0`, `SS+`, or `API`. It cannot add,
remove, or paraphrase an ordinary clause. Speech bubbles, subtitles, and
dialogue history retain the written forms; audio receives expansions such as
`five point zero` and `S S plus`. Older free-form `spoken_message` values are
ignored rather than risking a mismatch with the displayed line.

English TTS also applies a final pronunciation lexicon after the model's
spoken rendering. The name `Hirai` is currently sent to the synthesizer as
`heRAI`, and `maimai` is sent as `My-mai`; their written spellings remain
unchanged everywhere in the UI.

The routed assets can be regenerated with
`scripts/import-routed-icl-assets.py`; the running app needs neither Python nor
PyTorch because embeddings are checked in as JSON arrays.

This project was created using `bun init` in bun v1.2.23. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
