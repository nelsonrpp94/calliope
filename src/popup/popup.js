import browser from "webextension-polyfill";
import { CLOUD_VOICES } from "../tts/cloud.js";

const playButton = document.getElementById("play");
const pauseButton = document.getElementById("pause");
const stopButton = document.getElementById("stop");
const rateInput = document.getElementById("rate");
const rateValue = document.getElementById("rate-value");
const engineSelect = document.getElementById("engine");
const voiceSelect = document.getElementById("voice");
const apiKeyField = document.getElementById("apikey-field");
const apiKeyInput = document.getElementById("apikey");
const errorBox = document.getElementById("error");
const status = document.getElementById("status");

let currentState = "stopped";
let settings = { voice: null, cloudVoice: "alloy" };

function renderState(state) {
  currentState = state;
  status.dataset.state = state;
  status.textContent = state[0].toUpperCase() + state.slice(1);
  playButton.textContent = state === "paused" ? "▶ Resume" : "▶ Play";
  pauseButton.disabled = state !== "playing";
  stopButton.disabled = state === "stopped";
}

function renderRate(rate) {
  rateValue.textContent = `${Number(rate).toFixed(1)}×`;
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
  apiKeyField.hidden = engine !== "cloud";

  if (engine === "cloud") {
    for (const name of CLOUD_VOICES) {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name[0].toUpperCase() + name.slice(1);
      voiceSelect.append(option);
    }
    voiceSelect.value = settings.cloudVoice || CLOUD_VOICES[0];
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
    engine: "browser",
    cloudVoice: "alloy",
  });
  settings = stored;
  rateInput.value = stored.rate;
  renderRate(stored.rate);
  engineSelect.value = stored.engine;

  const { openaiApiKey } = await browser.storage.local.get("openaiApiKey");
  if (openaiApiKey) apiKeyInput.value = openaiApiKey;

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

engineSelect.addEventListener("change", () => {
  settings.engine = engineSelect.value;
  browser.storage.sync.set({ engine: engineSelect.value });
  renderVoices();
});

voiceSelect.addEventListener("change", () => {
  if (engineSelect.value === "cloud") {
    settings.cloudVoice = voiceSelect.value;
    browser.storage.sync.set({ cloudVoice: voiceSelect.value });
  } else {
    settings.voice = voiceSelect.value || null;
    browser.storage.sync.set({ voice: voiceSelect.value || null });
  }
});

apiKeyInput.addEventListener("change", () => {
  browser.storage.local.set({ openaiApiKey: apiKeyInput.value.trim() });
});

browser.runtime.onMessage.addListener((message) => {
  if (message?.type === "calliope:state") renderState(message.state);
  if (message?.type === "calliope:error") showError(message.message);
});

init();
