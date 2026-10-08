/**
 * Adds the "Approved scope changes since the permit" list to the calculation
 * notes (rows fid 29) the PCOC feed wrote before 2026-10-08. The calculation
 * sheet prints that list; without it the sheet says no changes were approved.
 *
 *   npx tsx --env-file=.env.local scripts/fix-calc-notes.ts PR-SFM-02245          # dry run, one case
 *   npx tsx --env-file=.env.local scripts/fix-calc-notes.ts PR-SFM-02245 --apply
 *   npx tsx --env-file=.env.local scripts/fix-calc-notes.ts --all [--apply]        # every feed-written row
 *
 * Only the note changes. Amounts, statuses and every other field stay as they are.
 */
import { changeBlock } from "../api/_lib/feed.ts";

const APPLY = process.argv.includes("--apply");
const ALL = process.argv.includes("--all");
const only = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const H = { "QB-Realm-Hostname": process.env.QB_REALM!, Authorization: `QB-USER-TOKEN ${process.env.QB_USER_TOKEN}`, "Content-Type": "application/json" };
type Rec = Record<string, { value: unknown }>;
async function query(from: string, select: number[], where: string): Promise<Rec[]> {
  const out: Rec[] = [];
  for (let skip = 0; ; skip += 1000) {
    const r = await (await fetch("https://api.quickbase.com/v1/records/query", { method: "POST", headers: H, body: JSON.stringify({ from, select, where, options: { top: 1000, skip } }) })).json();
    out.push(...(r.data ?? []));
    if ((r.data ?? []).length < 1000) return out;
  }
}
const n = (v: unknown) => Number(v) || 0;
const round = (x: number) => Math.round(x * 100) / 100;
const cons = (h: number, c: number, red: number) => round(h + c - red);
const key = (cs: string) => String(cs ?? "").replace(/\s*\(BR\)\s*$/i, "").trim();

if (!ALL && !only.length) { console.error("Name a case, or pass --all."); process.exit(1); }
const rows = (await query("bwdhfcec4", [3, 6, 7, 9, 11, 29], "{29.CT.'Added by the PCOC feed'}"))
  .filter((r) => !/Approved scope changes since the permit/.test(String(r[29].value)))
  .filter((r) => ALL || only.includes(key(String(r[7].value))));
const ids = [...new Set(rows.map((r) => String(r[6].value)).filter((x) => /^\d+$/.test(x)))];
const canopy = ids.length ? await query("bv45sinpu", [6, 27, 29, 30, 32, 39, 41], ids.map((i) => `{6.EX.'${i}'}`).join("OR")) : [];
const delta = (id: string) => {
  const r = canopy.find((x) => String(x[6].value) === id);
  if (!r) return null;
  const redPrev = r[39].value === "" || r[39].value == null ? r[41].value : r[39].value;
  return round(cons(n(r[29].value), n(r[32].value), n(r[41].value)) - cons(n(r[27].value), n(r[30].value), n(redPrev)));
};
const byCase: Record<string, Rec[]> = {};
rows.forEach((r) => (byCase[key(String(r[7].value))] ||= []).push(r));
const updates: { 3: { value: unknown }; 29: { value: string } }[] = [];
for (const [cs, R] of Object.entries(byCase)) {
  const list = R.filter((r) => /^\d+$/.test(String(r[6].value))).map((r) => ({
    approved: String(r[11].value ?? "").slice(0, 10), scopeChangeId: String(r[6].value), type: String(r[9].value ?? ""), change: delta(String(r[6].value)) ?? 0,
  }));
  if (!list.length) continue;
  const block = changeBlock(list).join("\n");
  for (const r of R) {
    const note = String(r[29].value);
    const at = note.lastIndexOf("\nAdded by the PCOC feed");
    const next = at >= 0 ? `${note.slice(0, at)}\n${block}\n${note.slice(at)}` : `${note}\n\n${block}`;
    updates.push({ 3: { value: r[3].value }, 29: { value: next } });
  }
  console.log(`${cs}: ${R.length} row(s)\n${block}\n`);
}
console.log(`${updates.length} row note(s) to update${APPLY ? "" : " (dry run — add --apply)"}`);
if (APPLY && updates.length) {
  const r = await (await fetch("https://api.quickbase.com/v1/records", { method: "POST", headers: H, body: JSON.stringify({ to: "bwdhfcec4", data: updates }) })).json();
  const errs = r.metadata?.lineErrors ?? {};
  console.log("updated", r.metadata?.updatedRecordIds?.length ?? 0, Object.keys(errs).length ? `ERRORS ${JSON.stringify(errs)}` : "");
}
