/**
 * Build script (esbuild). Bundles the three entry points into dist/ and
 * copies static assets plus the manifest for the chosen target.
 *
 * Usage:
 *   node build.js                 # production build for Chrome -> dist/chrome
 *   node build.js --watch         # watch mode
 *   BUILD_TARGET=firefox node build.js   # -> dist/firefox
 */
const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const watch = process.argv.includes("--watch");
const target = process.env.BUILD_TARGET || "chrome";
const outdir = path.join(__dirname, "dist", target);

function buildManifest() {
  const base = JSON.parse(fs.readFileSync("manifest.json", "utf8"));
  if (target === "firefox") {
    const overrides = JSON.parse(
      fs.readFileSync("manifest.firefox.json", "utf8")
    );
    Object.assign(base, overrides);
  }
  fs.writeFileSync(path.join(outdir, "manifest.json"), JSON.stringify(base, null, 2));
}

function copyVendorAssets() {
  const vendor = [
    ["node_modules/onnxruntime-web/dist/ort-wasm-simd.wasm", "vendor/ort/ort-wasm-simd.wasm"],
    ["node_modules/onnxruntime-web/dist/ort-wasm.wasm", "vendor/ort/ort-wasm.wasm"],
    ["node_modules/@diffusionstudio/piper-wasm/build/piper_phonemize.wasm", "vendor/piper/piper_phonemize.wasm"],
    ["node_modules/@diffusionstudio/piper-wasm/build/piper_phonemize.data", "vendor/piper/piper_phonemize.data"],
  ];
  for (const [src, dest] of vendor) {
    const target = path.join(outdir, dest);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(src, target);
  }
}

function copyStatic() {
  fs.mkdirSync(path.join(outdir, "popup"), { recursive: true });
  fs.copyFileSync("src/popup/popup.html", path.join(outdir, "popup/popup.html"));
  fs.copyFileSync("src/popup/popup.css", path.join(outdir, "popup/popup.css"));
  fs.cpSync("icons", path.join(outdir, "icons"), { recursive: true });
  if (target === "chrome") {
    fs.mkdirSync(path.join(outdir, "offscreen"), { recursive: true });
    fs.copyFileSync(
      "src/offscreen/offscreen.html",
      path.join(outdir, "offscreen/offscreen.html")
    );
  }
  copyVendorAssets();
  buildManifest();
}

const copyPlugin = {
  name: "copy-static",
  setup(build) {
    build.onEnd((result) => {
      if (result.errors.length === 0) copyStatic();
    });
  },
};

async function run() {
  fs.rmSync(outdir, { recursive: true, force: true });
  fs.mkdirSync(outdir, { recursive: true });

  const entryPoints = {
    background: "src/background.js",
    content: "src/content.js",
    "popup/popup": "src/popup/popup.js",
  };
  if (target === "chrome") {
    entryPoints["offscreen/offscreen"] = "src/offscreen/offscreen.js";
  }

  const options = {
    entryPoints,
    bundle: true,
    format: "iife",
    // Node built-ins referenced by emscripten's (unused) Node branch.
    external: ["fs", "path"],
    outdir,
    sourcemap: !watch ? false : "inline",
    minify: !watch,
    logLevel: "info",
    plugins: [copyPlugin],
  };

  if (watch) {
    const ctx = await esbuild.context(options);
    await ctx.watch();
    console.log(`[calliope] watching (target: ${target})…`);
  } else {
    await esbuild.build(options);
    console.log(`[calliope] built dist/ (target: ${target})`);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
