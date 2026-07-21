import browser from "webextension-polyfill";
import { WebSpeechEngine } from "./tts/webspeech.js";
import { OpenAICloudEngine } from "./tts/cloud.js";

// Injected on demand via scripting.executeScript; guard against running twice.
if (!window.__calliopeLoaded) {
  window.__calliopeLoaded = true;

  const engines = {
    browser: new WebSpeechEngine(),
    cloud: new OpenAICloudEngine(),
  };
  let active = engines.browser;

  const reportState = (state) => {
    browser.runtime
      .sendMessage({ type: "calliope:state-change", state })
      .catch(() => {});
  };
  engines.browser.onstatechange = reportState;
  engines.cloud.onstatechange = reportState;

  browser.runtime.onMessage.addListener((message) => {
    switch (message?.type) {
      case "calliope:get-selection":
        return Promise.resolve(window.getSelection().toString());
      case "calliope:speak": {
        const next = engines[message.engine] || engines.browser;
        if (next !== active) active.stop();
        active = next;
        active.speak(message.text, {
          rate: message.rate,
          voice: message.voice,
        });
        break;
      }
      case "calliope:pause":
        active.pause();
        break;
      case "calliope:resume":
        active.resume();
        break;
      case "calliope:stop":
        active.stop();
        break;
    }
    return undefined;
  });
}
