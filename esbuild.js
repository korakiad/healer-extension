const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");
const watch = process.argv.includes("--watch");

/** @type {import('esbuild').BuildOptions} */
const opts = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outfile: "dist/extension.js",
  external: ["vscode", "playwright-core", "ws"],
  format: "cjs",
  platform: "node",
  target: "node22",
  sourcemap: true,
};

function copyFloatBall() {
  const src = path.join("src", "element-picker", "injected", "float-ball.js");
  const dest = path.join("dist", "injected", "float-ball.js");
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

if (watch) {
  esbuild.context(opts).then((ctx) => {
    copyFloatBall();
    ctx.watch();
  });
} else {
  esbuild.build(opts).then(() => copyFloatBall());
}
