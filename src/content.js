import browser from "webextension-polyfill";
import { WebSpeechEngine } from "./tts/webspeech.js";

// Injected on demand via scripting.executeScript; guard against running twice.
if (!window.__calliopeLoaded) {
  window.__calliopeLoaded = true;

  const engine = new WebSpeechEngine();

  engine.onstatechange = (state) => {
    browser.runtime
      .sendMessage({ type: "calliope:state-change", state })
      .catch(() => {});
  };

  browser.runtime.onMessage.addListener((message) => {
    switch (message?.type) {
      case "calliope:get-selection":
        return Promise.resolve(window.getSelection().toString());
      case "calliope:speak":
        engine.speak(message.text, {
          rate: message.rate,
          voice: message.voice,
        });
        break;
      case "calliope:pause":
        engine.pause();
        break;
      case "calliope:resume":
        engine.resume();
        break;
      case "calliope:stop":
        engine.stop();
        break;
    }
    return undefined;
  });
}
