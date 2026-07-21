/**
 * Message-facing wrapper around the synthesizer. Runs in a document context:
 * the offscreen document on Chrome, the background event page on Firefox.
 */
import browser from "webextension-polyfill";

let synthModulePromise = null;
function loadSynthesizer() {
  synthModulePromise ??= import("./synthesizer.js");
  return synthModulePromise;
}

let lastNoteAt = 0;
function reportProgress({ loaded, total }) {
  const now = Date.now();
  if (now - lastNoteAt < 300) return; // throttle
  lastNoteAt = now;
  const text = total
    ? `Downloading voice… ${Math.round((loaded / total) * 100)}%`
    : "Downloading voice…";
  browser.runtime.sendMessage({ type: "calliope:note", text }).catch(() => {});
}

function clearNote() {
  browser.runtime.sendMessage({ type: "calliope:note", text: null }).catch(() => {});
}

export async function handleSynthesize(message) {
  try {
    const { synthesize } = await loadSynthesizer();
    const result = await synthesize(message, reportProgress);
    clearNote();
    return result;
  } catch (err) {
    clearNote();
    return { error: `Speech synthesis failed: ${err?.message || err}` };
  }
}

export function registerSynthHost() {
  browser.runtime.onMessage.addListener((message) => {
    if (message?.type === "calliope:synthesize") {
      return handleSynthesize(message);
    }
    return undefined;
  });
}
