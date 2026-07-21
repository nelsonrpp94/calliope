/**
 * Voice catalog. Models are downloaded from Hugging Face on first use and
 * cached in the browser's origin-private file system (OPFS) after that.
 */
export const DEFAULT_VOICE = "en_US-lessac-medium";

export const VOICES = [
  {
    id: "en_US-lessac-medium",
    label: "Lessac — English (US)",
    path: "en/en_US/lessac/medium/en_US-lessac-medium.onnx",
  },
  {
    id: "en_US-hfc_female-medium",
    label: "HFC Female — English (US)",
    path: "en/en_US/hfc_female/medium/en_US-hfc_female-medium.onnx",
  },
  {
    id: "pt_PT-tugão-medium",
    label: "Tugão — Português (Portugal)",
    path: "pt/pt_PT/tug%C3%A3o/medium/pt_PT-tug%C3%A3o-medium.onnx",
  },
  {
    id: "fr_FR-siwis-medium",
    label: "Siwis — Français",
    path: "fr/fr_FR/siwis/medium/fr_FR-siwis-medium.onnx",
  },
  {
    id: "es_ES-davefx-medium",
    label: "Davefx — Español",
    path: "es/es_ES/davefx/medium/es_ES-davefx-medium.onnx",
  },
  {
    id: "de_DE-thorsten-medium",
    label: "Thorsten — Deutsch",
    path: "de/de_DE/thorsten/medium/de_DE-thorsten-medium.onnx",
  },
  {
    id: "it_IT-paola-medium",
    label: "Paola — Italiano",
    path: "it/it_IT/paola/medium/it_IT-paola-medium.onnx",
  },
];
