# Calliope 🎙️

**Calliope** is a browser extension for Chrome and Firefox that reads selected text aloud with a natural human voice. Select text on any page, choose your reading speed, hit play — and listen.

Named after the Greek muse of eloquence and epic poetry.

## Features

- Read any selected text aloud on any webpage
- Adjustable reading speed (0.5x – 3x)
- Voice selection from available system/browser voices
- Play, pause, and stop controls
- Trigger via toolbar icon, right-click context menu, or keyboard shortcut
- Sentence highlighting while reading (planned)
- Settings persisted across sessions and devices

## Architecture

Single codebase using the WebExtensions API (Manifest V3), compatible with Chrome and Firefox via [`webextension-polyfill`](https://github.com/mozilla/webextension-polyfill).

```
calliope/
├── manifest.json          # MV3 manifest (Chrome base)
├── manifest.firefox.json  # Firefox overrides (event page instead of service worker)
├── src/
│   ├── background.js      # Service worker: playback state, context menu, commands
│   ├── content.js         # Content script: grabs window.getSelection()
│   ├── popup/
│   │   ├── popup.html     # Play/pause/stop, speed slider, voice selector
│   │   ├── popup.js
│   │   └── popup.css
│   └── tts/
│       ├── engine.js      # Abstract TTS engine interface (swappable)
│       └── webspeech.js   # Web Speech API implementation (MVP)
├── icons/
├── package.json
└── build.js               # Build config (esbuild)
```

### Voice engine

- **Primary:** [Piper](https://github.com/rhasspy/piper) neural voices running **inside the extension** via WebAssembly (`src/synth/synthesizer.js`): text is phonemized with espeak-ng (wasm) and synthesized with onnxruntime-web. Zero setup for users — voice models (~60 MB each) are downloaded from Hugging Face on first use and cached in OPFS. All wasm binaries ship in the extension package (`vendor/`), satisfying store no-remote-code policies. Voices: English (US) ×2, Português (Portugal), Français, Español, Deutsch, Italiano.
- On Chrome/Brave, synthesis runs in an **offscreen document** (MV3 service workers can't host the emscripten runtime); on Firefox it runs in the background event page.
- **Fallback:** Web Speech API (`speechSynthesis`) — whatever voices the browser provides.
- The `tts/engine.js` abstraction keeps engines swappable.

### Key implementation notes

- Split long selections into sentence chunks (~200 words max per utterance) and queue them — the Web Speech API struggles with long strings.
- Track playback state in the background worker so play/pause survives popup close.
- Speech synthesis runs in the content script of the page where text was selected: `speechSynthesis` is unavailable in Chrome MV3 service workers, and this avoids needing an offscreen document while staying cross-browser.
- Use `utterance.rate` for the speed slider and `utterance.onboundary` for sentence highlighting.
- Persist settings with `browser.storage.sync`.

## Roadmap

1. Manifest + content script text selection
2. Web Speech playback with speed control
3. Popup UI (controls, speed slider, voice selector)
4. Chunking + sentence highlighting
5. Firefox port and `web-ext` testing
6. Store submissions (Chrome Web Store, Firefox Add-ons)

## Development

```bash
npm install
npm run dev        # build in watch mode
npm run build      # production build
npm run firefox    # run in Firefox via web-ext
```

Load in Chrome/Brave/Edge: `chrome://extensions` (or `brave://extensions`) → enable Developer mode → "Load unpacked" → select the `dist/chrome/` folder.

Load in Firefox: `about:debugging` → "This Firefox" → "Load Temporary Add-on" → select `dist/firefox/manifest.json` (or use `npm run firefox`).

## License

MIT
