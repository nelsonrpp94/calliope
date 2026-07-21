import browser from "webextension-polyfill";

// Playback state lives here so it survives popup close. The actual speech
// runs in the content script of `playback.tabId` (speechSynthesis is not
// available in MV3 service workers).
const playback = {
  state: "stopped", // "playing" | "paused" | "stopped"
  tabId: null,
};

const DEFAULT_SETTINGS = {
  rate: 1,
  voice: null, // browser-engine voice name
  engine: "local", // "local" | "browser" | "cloud"
  cloudVoice: "alloy",
  localVoice: "en_US-lessac-medium",
};

async function getSettings() {
  const stored = await browser.storage.sync.get(DEFAULT_SETTINGS);
  return { ...DEFAULT_SETTINGS, ...stored };
}

async function ensureContentScript(tabId) {
  await browser.scripting.executeScript({
    target: { tabId },
    files: ["content.js"],
  });
}

async function broadcastState() {
  // Notify the popup (if open). No receiver is fine.
  browser.runtime
    .sendMessage({ type: "calliope:state", state: playback.state })
    .catch(() => {});
}

function setState(state, tabId = playback.tabId) {
  playback.state = state;
  playback.tabId = state === "stopped" ? null : tabId;
  broadcastState();
}

async function readSelectionInTab(tabId, selectionText = null) {
  await ensureContentScript(tabId);

  const text =
    selectionText ??
    (await browser.tabs.sendMessage(tabId, { type: "calliope:get-selection" }));
  if (!text || !text.trim()) return;

  // Only one tab reads at a time.
  if (playback.tabId !== null && playback.tabId !== tabId) {
    await sendToPlaybackTab({ type: "calliope:stop" });
  }

  const { rate, voice, engine, cloudVoice, localVoice } = await getSettings();
  const engineVoice =
    engine === "cloud" ? cloudVoice : engine === "local" ? localVoice : voice;
  await browser.tabs.sendMessage(tabId, {
    type: "calliope:speak",
    text,
    rate,
    engine,
    voice: engineVoice,
  });
  setState("playing", tabId);
}

async function sendToPlaybackTab(message) {
  if (playback.tabId === null) return;
  try {
    await browser.tabs.sendMessage(playback.tabId, message);
  } catch {
    // Tab was closed or navigated away; reset.
    setState("stopped");
  }
}

async function getActiveTab() {
  const [tab] = await browser.tabs.query({
    active: true,
    currentWindow: true,
  });
  return tab;
}

browser.runtime.onInstalled.addListener(() => {
  browser.contextMenus.create({
    id: "calliope-read-selection",
    title: "Read with Calliope",
    contexts: ["selection"],
  });
});

browser.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== "calliope-read-selection" || !tab?.id) return;
  readSelectionInTab(tab.id, info.selectionText);
});

browser.commands.onCommand.addListener(async (command) => {
  if (command !== "read-selection") return;
  const tab = await getActiveTab();
  if (tab?.id) readSelectionInTab(tab.id);
});

const OPENAI_TTS_URL = "https://api.openai.com/v1/audio/speech";
const OPENAI_TTS_MODEL = "gpt-4o-mini-tts";
const LOCAL_TTS_URL = "http://127.0.0.1:8473";
const LOCAL_SERVER_HINT =
  "Local Piper server is not running. Start it with: systemctl --user start calliope-piper";

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

async function fetchLocalTTS({ text, voice }) {
  try {
    const response = await fetch(`${LOCAL_TTS_URL}/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice }),
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 200);
      return { error: `Piper server error ${response.status}: ${detail}` };
    }
    return {
      audio: arrayBufferToBase64(await response.arrayBuffer()),
      mime: "audio/wav",
    };
  } catch {
    return { error: LOCAL_SERVER_HINT };
  }
}

async function listLocalVoices() {
  try {
    const response = await fetch(`${LOCAL_TTS_URL}/voices`);
    if (!response.ok) return { error: `server error ${response.status}` };
    return await response.json();
  } catch {
    return { error: LOCAL_SERVER_HINT };
  }
}

async function fetchCloudTTS({ text, voice }) {
  const { openaiApiKey } = await browser.storage.local.get("openaiApiKey");
  if (!openaiApiKey) {
    return { error: "No OpenAI API key set — add one in the Calliope popup." };
  }
  try {
    const response = await fetch(OPENAI_TTS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENAI_TTS_MODEL,
        voice,
        input: text,
        response_format: "mp3",
      }),
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 200);
      return { error: `OpenAI TTS error ${response.status}: ${detail}` };
    }
    return {
      audio: arrayBufferToBase64(await response.arrayBuffer()),
      mime: "audio/mp3",
    };
  } catch (err) {
    return { error: `Cloud TTS request failed: ${err.message || err}` };
  }
}

browser.runtime.onMessage.addListener((message, sender) => {
  switch (message?.type) {
    // Content script asks for synthesized audio (keys + host permissions
    // live here, and background fetches are exempt from page CORS).
    case "calliope:fetch-tts":
      return message.engine === "local"
        ? fetchLocalTTS(message)
        : fetchCloudTTS(message);
    case "calliope:list-local-voices":
      return listLocalVoices();
    // Engine state reported by the content script doing the reading.
    case "calliope:state-change":
      if (sender.tab?.id === playback.tabId) {
        setState(message.state);
      }
      return undefined;

    // Commands from the popup.
    case "calliope:play":
      return getActiveTab().then((tab) => {
        if (tab?.id) return readSelectionInTab(tab.id);
      });
    case "calliope:pause":
      sendToPlaybackTab({ type: "calliope:pause" });
      return undefined;
    case "calliope:resume":
      sendToPlaybackTab({ type: "calliope:resume" });
      return undefined;
    case "calliope:stop":
      sendToPlaybackTab({ type: "calliope:stop" });
      return undefined;
    case "calliope:get-state":
      return Promise.resolve({ state: playback.state });
  }
  return undefined;
});
