// Syntax-check the classic-script engine files (they are not ES modules).
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
const dir = mkdtempSync(join(tmpdir(), "pcoc-"));
for (const f of ["public/engine.js", "public/engine-app.js"]) {
  const out = join(dir, f.split("/").pop().replace(/\.js$/, ".cjs"));
  writeFileSync(out, readFileSync(f, "utf8"));
  execFileSync(process.execPath, ["--check", out], { stdio: "inherit" });
  console.log("ok", f);
}
