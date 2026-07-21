import browser from "webextension-polyfill";

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

const LOCALE_LABELS = {
  en_US: "English (US)",
  en_GB: "English (UK)",
  pt_PT: "Português (Portugal)",
  pt_BR: "Português (Brasil)",
  fr_FR: "Français",
  es_ES: "Español",
  de_DE: "Deutsch",
  it_IT: "Italiano",
};

let currentState = "stopped";
let settings = { voice: null, localVoice: "en_US-lessac-medium" };

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

/** "pt_PT-tugao-medium" -> "Tugao — Português (Portugal)" */
function voiceLabel(name) {
  const match = name.match(/^([a-z]{2}_[A-Z]{2})-(.+)-(x_low|low|medium|high)$/);
  if (!match) return name;
  const [, locale, speaker] = match;
  const language = LOCALE_LABELS[locale] || locale.replace("_", "-");
  const pretty =
    speaker[0].toUpperCase() + speaker.slice(1).replace(/_/g, " ");
  return `${pretty} — ${language}`;
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
    const result = await browser.runtime.sendMessage({
      type: "calliope:list-local-voices",
    });
    if (result?.error || !result?.voices?.length) {
      const option = document.createElement("option");
      option.value = settings.localVoice || "";
      option.textContent = settings.localVoice
        ? voiceLabel(settings.localVoice)
        : "(server not running)";
      voiceSelect.append(option);
      if (result?.error) showError(result.error);
    } else {
      for (const name of result.voices) {
        const option = document.createElement("option");
        option.value = name;
        option.textContent = voiceLabel(name);
        voiceSelect.append(option);
      }
      voiceSelect.value = result.voices.includes(settings.localVoice)
        ? settings.localVoice
        : result.default || result.voices[0];
    }
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
});

init();
