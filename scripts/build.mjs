// Bundles src/index.ts into one IIFE file for a <script> tag on customer sites.
import { readFileSync } from "node:fs";
import * as esbuild from "esbuild";

const { version } = JSON.parse(readFileSync("package.json", "utf8"));

const watch = process.argv.includes("--watch");
const options = {
  entryPoints: ["src/index.ts"],
  bundle: true,
  format: "iife",
  target: "es2020",
  minify: !watch,
  sourcemap: watch ? "inline" : false,
  outfile: "dist/metaphor.js",
  legalComments: "none",
  banner: { js: `/*! Metaphor Web SDK v${version} */` },
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log("watching src/ → dist/metaphor.js");
} else {
  await esbuild.build(options);
}
