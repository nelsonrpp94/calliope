/**
 * In-extension Piper speech synthesis (WebAssembly).
 *
 * Pipeline: text -> phoneme ids (piper_phonemize, espeak-ng wasm)
 *              -> VITS onnx model (onnxruntime-web, wasm)
 *              -> 16-bit WAV, returned as base64.
 *
 * All wasm binaries are bundled with the extension (vendor/); only the voice
 * models (~60 MB each) are downloaded from Hugging Face on first use and
 * cached in OPFS.
 *
 * Must run in a document context (offscreen document on Chrome, background
 * event page on Firefox) — the emscripten loader needs XHR.
 *
 * This module intentionally avoids webextension-polyfill so it can also be
 * loaded in a plain test page with `globalThis.__CALLIOPE_ASSET_BASE__` set.
 */
import * as ort from "onnxruntime-web";
import createPiperPhonemize from "../../node_modules/@diffusionstudio/piper-wasm/build/piper_phonemize.js";
import { VOICES, DEFAULT_VOICE } from "../tts/catalog.js";

const HF_BASE = "https://huggingface.co/rhasspy/piper-voices/resolve/main";
const VOICES_BY_ID = Object.fromEntries(VOICES.map((v) => [v.id, v]));

function assetBase() {
  if (globalThis.__CALLIOPE_ASSET_BASE__) {
    return globalThis.__CALLIOPE_ASSET_BASE__;
  }
  return (globalThis.browser ?? globalThis.chrome).runtime.getURL("");
}

let ortConfigured = false;
function configureOrt() {
  if (ortConfigured) return;
  ort.env.wasm.numThreads = 1; // threaded wasm needs cross-origin isolation
  ort.env.wasm.wasmPaths = `${assetBase()}vendor/ort/`;
  ortConfigured = true;
}

// --- OPFS model cache ------------------------------------------------------

async function cacheDir() {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle("piper", { create: true });
}

async function cacheRead(name) {
  try {
    const dir = await cacheDir();
    return await (await dir.getFileHandle(name)).getFile();
  } catch {
    return null;
  }
}

async function cacheWrite(name, blob) {
  try {
    const dir = await cacheDir();
    const writable = await (
      await dir.getFileHandle(name, { create: true })
    ).createWritable();
    await writable.write(blob);
    await writable.close();
  } catch (err) {
    // Cache failures are non-fatal — synthesis just re-downloads next time.
    console.error("calliope: model cache write failed", err);
  }
}

async function fetchWithProgress(url, onProgress) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`voice download failed (HTTP ${response.status})`);
  }
  if (!response.body || !onProgress) return response.blob();

  const total = Number(response.headers.get("Content-Length") ?? 0);
  const reader = response.body.getReader();
  const parts = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    loaded += value.length;
    onProgress({ loaded, total });
  }
  return new Blob(parts);
}

async function cachedFetch(cacheName, url, onProgress) {
  const hit = await cacheRead(cacheName);
  if (hit) return hit;
  const blob = await fetchWithProgress(url, onProgress);
  await cacheWrite(cacheName, blob);
  return blob;
}

// --- phonemization ---------------------------------------------------------

function phonemize(text, espeakVoice) {
  const input = JSON.stringify([{ text: text.trim() }]);
  return new Promise((resolve, reject) => {
    createPiperPhonemize({
      print(message) {
        resolve(JSON.parse(message).phoneme_ids);
      },
      printErr(message) {
        reject(new Error(message));
      },
      locateFile(file) {
        return `${assetBase()}vendor/piper/${file}`;
      },
    })
      .then((module) => {
        module.callMain([
          "-l",
          espeakVoice,
          "--input",
          input,
          "--espeak_data",
          "/espeak-ng-data",
        ]);
      })
      .catch(reject);
  });
}

// --- inference -------------------------------------------------------------

let active = null; // { voiceId, session, config } — one model in memory

async function getVoice(voiceId, onProgress) {
  if (active?.voiceId === voiceId) return active;

  const voice = VOICES_BY_ID[voiceId] ?? VOICES_BY_ID[DEFAULT_VOICE];
  const configBlob = await cachedFetch(
    `${voice.id}.onnx.json`,
    `${HF_BASE}/${voice.path}.json`
  );
  const config = JSON.parse(await configBlob.text());
  const modelBlob = await cachedFetch(
    `${voice.id}.onnx`,
    `${HF_BASE}/${voice.path}`,
    onProgress
  );

  configureOrt();
  const session = await ort.InferenceSession.create(
    await modelBlob.arrayBuffer()
  );
  if (active?.session) {
    try {
      await active.session.release();
    } catch {
      /* ignore */
    }
  }
  active = { voiceId: voice.id, session, config };
  return active;
}

function encodeWav(samples, sampleRate) {
  const HEADER = 44;
  const view = new DataView(new ArrayBuffer(HEADER + samples.length * 2));
  view.setUint32(0, 0x46464952, true); // "RIFF"
  view.setUint32(4, view.buffer.byteLength - 8, true);
  view.setUint32(8, 0x45564157, true); // "WAVE"
  view.setUint32(12, 0x20746d66, true); // "fmt "
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  view.setUint32(36, 0x61746164, true); // "data"
  view.setUint32(40, samples.length * 2, true);
  let offset = HEADER;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 32768 : s * 32767, true);
    offset += 2;
  }
  return view.buffer;
}

function base64FromBuffer(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/**
 * Synthesize `text` with `voice` (a catalog id). Returns
 * `{audio: <base64 wav>, mime: "audio/wav"}`.
 */
export async function synthesize({ text, voice }, onProgress) {
  const { session, config } = await getVoice(
    voice || DEFAULT_VOICE,
    onProgress
  );
  const phonemeIds = await phonemize(text, config.espeak.voice);

  const feeds = {
    input: new ort.Tensor(
      "int64",
      BigInt64Array.from(phonemeIds, BigInt),
      [1, phonemeIds.length]
    ),
    input_lengths: new ort.Tensor(
      "int64",
      BigInt64Array.from([BigInt(phonemeIds.length)])
    ),
    scales: new ort.Tensor(
      "float32",
      Float32Array.from([
        config.inference.noise_scale,
        config.inference.length_scale,
        config.inference.noise_w,
      ])
    ),
  };
  if (Object.keys(config.speaker_id_map ?? {}).length) {
    feeds.sid = new ort.Tensor("int64", BigInt64Array.from([0n]));
  }

  const { output } = await session.run(feeds);
  const wav = encodeWav(output.data, config.audio.sample_rate);
  return { audio: base64FromBuffer(wav), mime: "audio/wav" };
}
