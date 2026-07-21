import browser from "webextension-polyfill";

const playButton = document.getElementById("play");
const pauseButton = document.getElementById("pause");
const stopButton = document.getElementById("stop");
const rateInput = document.getElementById("rate");
const rateValue = document.getElementById("rate-value");
const voiceSelect = document.getElementById("voice");
const status = document.getElementById("status");

let currentState = "stopped";

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

async function loadVoices() {
  // The popup is a real document, so speechSynthesis is available here.
  const voices = await new Promise((resolve) => {
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

  for (const voice of voices) {
    const option = document.createElement("option");
    option.value = voice.name;
    option.textContent = `${voice.name} (${voice.lang})`;
    voiceSelect.append(option);
  }
}

async function init() {
  const { rate = 1, voice = null } = await browser.storage.sync.get([
    "rate",
    "voice",
  ]);
  rateInput.value = rate;
  renderRate(rate);

  await loadVoices();
  if (voice) voiceSelect.value = voice;

  const { state } = await browser.runtime.sendMessage({
    type: "calliope:get-state",
  });
  renderState(state);
}

playButton.addEventListener("click", () => {
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

voiceSelect.addEventListener("change", () => {
  browser.storage.sync.set({ voice: voiceSelect.value || null });
});

browser.runtime.onMessage.addListener((message) => {
  if (message?.type === "calliope:state") renderState(message.state);
});

init();
