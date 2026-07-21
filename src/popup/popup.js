import browser from "webextension-polyfill";
import { VOICES, DEFAULT_VOICE } from "../tts/catalog.js";

const playButton = document.getElementById("play");
const pauseButton = document.getElementById("pause");
const stopButton = document.getElementById("stop");
const rateInput = document.getElementById("rate");
const rateValue = document.getElementById("rate-value");
const engineSelect = document.getElementById("engine");
const voiceSelect = document.getElementById("voice");
const errorBox = document.getElementById("error");
const status = document.getElementById("status");
const statusText = document.getElementById("status-text");
const playLabel = document.getElementById("play-label");
const settingsToggle = document.getElementById("settings-toggle");
const settingsPanel = document.getElementById("settings");

const STATUS_TEXT = {
  playing: "Reading…",
  paused: "Paused",
  stopped: "Stopped",
};

let currentState = "stopped";
let settings = { voice: null, localVoice: DEFAULT_VOICE };

function renderState(state) {
  currentState = state;
  status.dataset.state = state;
  statusText.textContent = STATUS_TEXT[state] || state;
  playLabel.textContent = state === "paused" ? "Resume" : "Play";
  pauseButton.disabled = state !== "playing";
  stopButton.disabled = state === "stopped";
}

function renderRate(rate) {
  rateValue.textContent = `${Number(rate).toFixed(1)}x`;
}

function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = false;
}

async function getBrowserVoices() {
  // The popup is a real document, so speechSynthesis is available here.
  return new Promise((resolve) => {
    const list = speechSynthesis.getVoices();
    if (list.length) return resolve(list);
    speechSynthesis.addEventListener(
      "voiceschanged",
      () => resolve(speechSynthesis.getVoices()),
      { once: true }
    );
    // Some platforms never fire voiceschanged; don't hang forever.
    setTimeout(() => resolve(speechSynthesis.getVoices()), 1000);
  });
}

async function renderVoices() {
  const engine = engineSelect.value;
  voiceSelect.innerHTML = "";

  if (engine === "local") {
    for (const voice of VOICES) {
      const option = document.createElement("option");
      option.value = voice.id;
      option.textContent = voice.label;
      voiceSelect.append(option);
    }
    voiceSelect.value = VOICES.some((v) => v.id === settings.localVoice)
      ? settings.localVoice
      : DEFAULT_VOICE;
  } else {
    const defaultOption = document.createElement("option");
    defaultOption.value = "";
    defaultOption.textContent = "System default";
    voiceSelect.append(defaultOption);
    for (const voice of await getBrowserVoices()) {
      const option = document.createElement("option");
      option.value = voice.name;
      option.textContent = `${voice.name} (${voice.lang})`;
      voiceSelect.append(option);
    }
    voiceSelect.value = settings.voice || "";
  }
}

async function init() {
  const stored = await browser.storage.sync.get({
    rate: 1,
    voice: null,
    engine: "local",
    localVoice: "en_US-lessac-medium",
  });
  settings = stored;
  if (!["local", "browser"].includes(settings.engine)) {
    settings.engine = "local"; // e.g. "cloud" left over from older versions
  }
  rateInput.value = settings.rate;
  renderRate(settings.rate);
  engineSelect.value = settings.engine;

  await renderVoices();

  const { state } = await browser.runtime.sendMessage({
    type: "calliope:get-state",
  });
  renderState(state);
}

playButton.addEventListener("click", () => {
  errorBox.hidden = true;
  browser.runtime.sendMessage({
    type: currentState === "paused" ? "calliope:resume" : "calliope:play",
  });
});

pauseButton.addEventListener("click", () => {
  browser.runtime.sendMessage({ type: "calliope:pause" });
});

stopButton.addEventListener("click", () => {
  browser.runtime.sendMessage({ type: "calliope:stop" });
});

rateInput.addEventListener("input", () => {
  renderRate(rateInput.value);
});

rateInput.addEventListener("change", () => {
  browser.storage.sync.set({ rate: Number(rateInput.value) });
});

settingsToggle.addEventListener("click", () => {
  settingsPanel.hidden = !settingsPanel.hidden;
});

engineSelect.addEventListener("change", () => {
  settings.engine = engineSelect.value;
  browser.storage.sync.set({ engine: engineSelect.value });
  renderVoices();
});

voiceSelect.addEventListener("change", () => {
  if (engineSelect.value === "local") {
    settings.localVoice = voiceSelect.value;
    browser.storage.sync.set({ localVoice: voiceSelect.value });
  } else {
    settings.voice = voiceSelect.value || null;
    browser.storage.sync.set({ voice: voiceSelect.value || null });
  }
});

browser.runtime.onMessage.addListener((message) => {
  if (message?.type === "calliope:state") renderState(message.state);
  if (message?.type === "calliope:error") showError(message.message);
  if (message?.type === "calliope:note") {
    // Transient status notes from the speech engine (e.g. download progress).
    if (message.text) statusText.textContent = message.text;
    else renderState(currentState);
  }
});

init();
