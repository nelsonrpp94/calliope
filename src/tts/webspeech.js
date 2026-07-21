import { TTSEngine } from "./engine.js";

const MAX_WORDS_PER_CHUNK = 200;

/**
 * Split text into sentence-based chunks of at most ~200 words each.
 * The Web Speech API tends to cut out on long strings, so long selections
 * are queued as a sequence of shorter utterances. A single sentence longer
 * than the limit is split on word boundaries.
 */
export function chunkText(text, maxWords = MAX_WORDS_PER_CHUNK) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];

  // Split after sentence-ending punctuation followed by whitespace.
  const sentences = normalized.split(/(?<=[.!?…])\s+/);

  const chunks = [];
  let current = [];
  let currentWords = 0;

  const flush = () => {
    if (current.length) {
      chunks.push(current.join(" "));
      current = [];
      currentWords = 0;
    }
  };

  for (const sentence of sentences) {
    const words = sentence.split(" ");
    if (words.length > maxWords) {
      // Oversized sentence: flush what we have, then hard-split by words.
      flush();
      for (let i = 0; i < words.length; i += maxWords) {
        chunks.push(words.slice(i, i + maxWords).join(" "));
      }
      continue;
    }
    if (currentWords + words.length > maxWords) flush();
    current.push(sentence);
    currentWords += words.length;
  }
  flush();

  return chunks;
}

/** TTS engine backed by the browser's Web Speech API (speechSynthesis). */
export class WebSpeechEngine extends TTSEngine {
  constructor(synth = globalThis.speechSynthesis) {
    super();
    this.synth = synth;
    this.rate = 1;
    this.voiceName = null;
    this.queue = [];
    this.queueIndex = 0;
    this.state = "stopped";
  }

  speak(text, { rate, voice } = {}) {
    this.stop();
    if (rate !== undefined) this.rate = rate;
    if (voice !== undefined) this.voiceName = voice;

    this.queue = chunkText(text);
    this.queueIndex = 0;
    if (!this.queue.length) return;

    this._setState("playing");
    this._speakNext();
  }

  pause() {
    if (this.state !== "playing") return;
    this.synth.pause();
    this._setState("paused");
  }

  resume() {
    if (this.state !== "paused") return;
    this.synth.resume();
    this._setState("playing");
  }

  stop() {
    this.queue = [];
    this.queueIndex = 0;
    this.synth.cancel();
    this._setState("stopped");
  }

  setRate(rate) {
    this.rate = rate;
  }

  listVoices() {
    return new Promise((resolve) => {
      const map = (voices) =>
        voices.map((v) => ({ name: v.name, lang: v.lang, default: v.default }));
      const voices = this.synth.getVoices();
      if (voices.length) return resolve(map(voices));
      // Chrome loads voices asynchronously on first access.
      this.synth.addEventListener(
        "voiceschanged",
        () => resolve(map(this.synth.getVoices())),
        { once: true }
      );
    });
  }

  _speakNext() {
    if (this.queueIndex >= this.queue.length) {
      this._setState("stopped");
      return;
    }
    const utterance = new SpeechSynthesisUtterance(this.queue[this.queueIndex]);
    utterance.rate = this.rate;
    if (this.voiceName) {
      const voice = this.synth
        .getVoices()
        .find((v) => v.name === this.voiceName);
      if (voice) utterance.voice = voice;
    }
    utterance.onend = () => {
      this.queueIndex += 1;
      // stop() cancels mid-utterance; onend still fires, so only continue
      // if we are still playing this queue.
      if (this.state !== "stopped") this._speakNext();
    };
    utterance.onerror = () => {
      if (this.state !== "stopped") this._setState("stopped");
    };
    this.synth.speak(utterance);
  }

  _setState(state) {
    if (this.state === state) return;
    this.state = state;
    this.onstatechange(state);
  }
}
