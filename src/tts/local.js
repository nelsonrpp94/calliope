import browser from "webextension-polyfill";
import { TTSEngine } from "./engine.js";
import { chunkText } from "./webspeech.js";

/**
 * TTS engine that plays audio synthesized by the local Piper server
 * (http://127.0.0.1:8473 — see tools/piper-server.py).
 *
 * Runs in the content script; audio fetching is delegated to the background
 * script (which holds the host permission) via "calliope:fetch-tts" messages
 * returning base64 WAV. Chunks are played sequentially with the next chunk
 * prefetched during playback.
 */
export class LocalTTSEngine extends TTSEngine {
  constructor() {
    super();
    this.rate = 1;
    this.voice = null;
    this.queue = [];
    this.index = 0;
    this.audio = null;
    this.state = "stopped";
    this.prefetched = new Map();
    // Incremented by stop() so in-flight async playback loops can tell
    // they belong to a cancelled run.
    this.generation = 0;
  }

  speak(text, { rate, voice } = {}) {
    this.stop();
    if (rate !== undefined) this.rate = rate;
    if (voice) this.voice = voice;

    this.queue = chunkText(text);
    this.index = 0;
    if (!this.queue.length) return;

    this._setState("playing");
    this._playNext();
  }

  pause() {
    if (this.state !== "playing" || !this.audio) return;
    this.audio.pause();
    this._setState("paused");
  }

  resume() {
    if (this.state !== "paused" || !this.audio) return;
    this.audio.play().catch(() => {});
    this._setState("playing");
  }

  stop() {
    this.generation += 1;
    if (this.audio) {
      this.audio.pause();
      this.audio = null;
    }
    this.queue = [];
    this.index = 0;
    this.prefetched = new Map();
    this._setState("stopped");
  }

  setRate(rate) {
    this.rate = rate;
    if (this.audio) this.audio.playbackRate = rate;
  }

  listVoices() {
    return Promise.resolve([]); // voice lists are handled by the popup
  }

  _fetchChunk(index) {
    if (!this.prefetched.has(index)) {
      this.prefetched.set(
        index,
        browser.runtime.sendMessage({
          type: "calliope:fetch-tts",
          text: this.queue[index],
          voice: this.voice,
        })
      );
    }
    return this.prefetched.get(index);
  }

  async _playNext() {
    if (this.index >= this.queue.length) {
      this._setState("stopped");
      return;
    }
    const generation = this.generation;
    let result;
    try {
      result = await this._fetchChunk(this.index);
    } catch (err) {
      result = { error: String(err) };
    }
    if (generation !== this.generation) return; // stopped while fetching

    if (!result || result.error || !result.audio) {
      this._fail(result?.error);
      return;
    }

    const audio = new Audio(`data:audio/wav;base64,${result.audio}`);
    audio.playbackRate = this.rate;
    audio.preservesPitch = true;
    audio.onended = () => {
      if (generation !== this.generation) return;
      this.index += 1;
      this._playNext();
    };
    audio.onerror = () => {
      if (generation === this.generation) this._fail("Audio playback failed");
    };
    this.audio = audio;
    audio.play().catch(() => this._fail("Audio playback was blocked"));

    // Prefetch the next chunk while this one plays.
    if (this.index + 1 < this.queue.length) this._fetchChunk(this.index + 1);
  }

  _fail(message) {
    browser.runtime
      .sendMessage({
        type: "calliope:error",
        message: message || "Speech synthesis failed",
      })
      .catch(() => {});
    this.stop();
  }

  _setState(state) {
    if (this.state === state) return;
    this.state = state;
    this.onstatechange(state);
  }
}
