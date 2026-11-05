// Fails when the gzipped bundle exceeds the budget: the SDK runs on every customer page.
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const BUDGET = 50 * 1024;
const size = gzipSync(readFileSync("dist/metaphor.js")).length;
console.log(`dist/metaphor.js gzip: ${(size / 1024).toFixed(1)} KiB (budget ${BUDGET / 1024} KiB)`);
if (size > BUDGET) process.exit(1);
