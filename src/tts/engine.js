/**
 * Abstract TTS engine interface. Implementations (Web Speech API today,
 * cloud voices later) must be swappable behind this contract.
 *
 * State callbacks: assign `onstatechange(state)` to receive
 * "playing" | "paused" | "stopped" transitions.
 */
export class TTSEngine {
  constructor() {
    /** @type {(state: "playing"|"paused"|"stopped") => void} */
    this.onstatechange = () => {};
  }

  /**
   * Start reading `text` from the beginning. Replaces any current playback.
   * @param {string} text
   * @param {{rate?: number, voice?: string}} [options]
   */
  speak(text, options) {
    throw new Error("not implemented");
  }

  /** Pause playback, keeping position. */
  pause() {
    throw new Error("not implemented");
  }

  /** Resume paused playback. */
  resume() {
    throw new Error("not implemented");
  }

  /** Stop playback and discard the queue. */
  stop() {
    throw new Error("not implemented");
  }

  /**
   * Set the reading rate (1 = normal). Applies to subsequent utterances.
   * @param {number} rate
   */
  setRate(rate) {
    throw new Error("not implemented");
  }

  /**
   * List available voices.
   * @returns {Promise<Array<{name: string, lang: string, default: boolean}>>}
   */
  listVoices() {
    throw new Error("not implemented");
  }
}
