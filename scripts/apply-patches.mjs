/** Applies scripts/engine-patches.mjs to the current public/engine.js (idempotent). */
import { readFileSync, writeFileSync } from "node:fs";
import { applyPatches, PATCHES } from "./engine-patches.mjs";

const file = "public/engine.js";
const before = readFileSync(file, "utf8");
const after = applyPatches(before);
writeFileSync(file, after);
console.log(`${PATCHES.length} patches checked; engine.js ${before === after ? "unchanged" : "updated"}.`);
