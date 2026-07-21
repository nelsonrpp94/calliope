// Offscreen document (Chrome MV3): hosts the WASM TTS engine, since service
// workers can't run the emscripten loader or XHR.
import { registerSynthHost } from "../synth/host.js";

registerSynthHost();
