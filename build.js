/**
 * Build script (esbuild). Bundles the three entry points into dist/ and
 * copies static assets plus the manifest for the chosen target.
 *
 * Usage:
 *   node build.js                 # production build for Chrome
 *   node build.js --watch         # watch mode
 *   BUILD_TARGET=firefox node build.js
 */
const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const watch = process.argv.includes("--watch");
const target = process.env.BUILD_TARGET || "chrome";
const outdir = path.join(__dirname, "dist");

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

function copyStatic() {
  fs.mkdirSync(path.join(outdir, "popup"), { recursive: true });
  fs.copyFileSync("src/popup/popup.html", path.join(outdir, "popup/popup.html"));
  fs.copyFileSync("src/popup/popup.css", path.join(outdir, "popup/popup.css"));
  fs.cpSync("icons", path.join(outdir, "icons"), { recursive: true });
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

  const options = {
    entryPoints: {
      background: "src/background.js",
      content: "src/content.js",
      "popup/popup": "src/popup/popup.js",
    },
    bundle: true,
    format: "iife",
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
