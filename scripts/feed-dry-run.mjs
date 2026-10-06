/**
 * PCOC feed — DRY RUN. Reads only; writes nothing to Quickbase.
 *
 * Works out which Canopy scope changes need a PCOC Amendments row that does
 * not exist yet, using the rules Jim's 23–29 Sep 2026 import followed:
 *
 *   - source: "Canopy - Scope Changes" (bv45sinpu), refreshed from Canopy's export;
 *   - a scope change counts when it is Approved, approved AFTER the permit was
 *     filed (Jobs fid 1701 "PCK PC Filed Date"), and changed the construction
 *     cost = Hard + Cap Exception − Scope Reduction (Temporary Relocation, soft
 *     costs, taxes and task-order cost do not count);
 *   - "At Permit" = the amounts before the first counting change;
 *     "Now" = the amounts after the latest approved change of the case;
 *   - starting status: amount < 0 → Refund; = 0 → Not Required;
 *     job closed / complete → Verify — job closed; RECON without Structure →
 *     Waiting — Structure not passed; otherwise Required — Pending.
 *
 * Only cases with NO PCOC row yet are added. Jim's import gave rows to most
 * cost increases but skipped many reductions and "Final SoW" changes, and that
 * per-change choice cannot be reproduced exactly; the case-level amounts can
 * (they match on every case the two share). So a case already in PCOC is never
 * given extra rows: if Canopy has moved on since, it is listed for review.
 *
 * Usage:  node --env-file=.env.local scripts/feed-dry-run.mjs [outDir]
 * Writes: <outDir>/pcoc-feed-dry-run.csv and .md  (default outDir: reports/)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const REALM = process.env.QB_REALM, TOKEN = process.env.QB_USER_TOKEN;
if (!REALM || !TOKEN) { console.error("Set QB_REALM and QB_USER_TOKEN"); process.exit(1); }
const H = { "QB-Realm-Hostname": REALM, Authorization: `QB-USER-TOKEN ${TOKEN}`, "Content-Type": "application/json" };
const OUT = process.argv[2] || "reports";

const T = { SC: "bv45sinpu", ROWS: "bwdhfcec4", JOBS: "buskqh27b" };
const SCF = { id: 6, cs: 7, type: 15, status: 16, toPrev: 19, toChg: 20, toRev: 21, softPrev: 24, softRev: 26,
  hardPrev: 27, hardRev: 29, capPrev: 30, capRev: 32, taxPrev: 33, taxRev: 35, tempPrev: 36, tempRev: 38,
  redPrev: 39, redRev: 41, muni: 46, addr: 47, approved: 68, job: 73 };
const JF = { name: 6, permitFiled: 1701, permitClockFiled: 1719, permitOnPermit: 1791, permitClockIssued: 1720, permitNo: 1143, family: 1556, cons: 1116, structure: 1365 };
/* The permit date, first one present: filed (what the permit value is fixed
   at), then the permit clock's filed date, the issued date printed on the
   permit, the permit clock's issued date. */
const PERMIT_ORDER = ["permitFiled", "permitClockFiled", "permitOnPermit", "permitClockIssued"];

async function all(from, select, where) {
  let out = [], skip = 0;
  for (;;) {
    const r = await fetch("https://api.quickbase.com/v1/records/query", { method: "POST", headers: H,
      body: JSON.stringify({ from, select, where, options: { skip, top: 1000 } }) });
    const j = await r.json();
    if (!r.ok) throw new Error(`${from}: ${r.status} ${JSON.stringify(j).slice(0, 200)}`);
    out = out.concat(j.data || []);
    if (!j.data || j.data.length < 1000) return out;
    skip += 1000;
  }
}
const val = (r, f) => { const v = r[f]?.value; return Array.isArray(v) ? v.filter(Boolean).pop() ?? "" : v ?? ""; };
const num = (v) => Number(String(v ?? "").replace(/[$,]/g, "")) || 0;
/** Canopy dates are "DD/MM/YYYY HH:MM"; Quickbase dates are ISO. */
const iso = (v) => {
  const s = String(v ?? "").trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : "";
};
const cons = (h, c, r) => Math.round((h + c - r) * 100) / 100;
const money = (n) => (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const scSel = Object.values(SCF);
const [scAll, rows] = await Promise.all([
  all(T.SC, scSel),
  all(T.ROWS, [6, 7, 8, 11, 12, 14, 21, 24, 25, 26]),
]);
const jobIds = [...new Set(scAll.map((r) => val(r, SCF.job)).filter(Boolean))];
const jobs = {};
for (let i = 0; i < jobIds.length; i += 80) {
  const where = jobIds.slice(i, i + 80).map((id) => `{3.EX.${id}}`).join("OR");
  for (const j of await all(T.JOBS, [3, ...Object.values(JF)], where)) jobs[j[3].value] = j;
}

/* group approved scope changes by case */
const byCase = {};
for (const r of scAll) {
  if (!/^approved$/i.test(String(val(r, SCF.status)).trim())) continue;
  const cs = String(val(r, SCF.cs)).trim(); if (!cs) continue;
  (byCase[cs] = byCase[cs] || []).push(r);
}

const have = new Set(rows.map((r) => String(val(r, 6))));
const results = [], review = [], noPermit = [], check = { cases: 0, rowsMatched: 0, rowsMissed: [], amountsMatched: 0, amountsOff: [] };

for (const [cs, list] of Object.entries(byCase)) {
  list.sort((a, b) => iso(val(a, SCF.approved)).localeCompare(iso(val(b, SCF.approved))));
  const jobId = val(list[0], SCF.job), job = jobs[jobId];
  const permitKey = job ? PERMIT_ORDER.find((k) => iso(val(job, JF[k]))) : undefined;
  const permit = permitKey ? iso(val(job, JF[permitKey])) : "";
  const counting = list.filter((r) => {
    const d = iso(val(r, SCF.approved));
    const delta = cons(num(val(r, SCF.hardRev)), num(val(r, SCF.capRev)), num(val(r, SCF.redRev)))
                - cons(num(val(r, SCF.hardPrev)), num(val(r, SCF.capPrev)), num(val(r, SCF.redPrev) || val(r, SCF.redRev)));
    return d && (!permit || d > permit) && Math.abs(delta) >= 0.01;
  });
  if (!counting.length) continue;
  if (!permit) { noPermit.push({ cs, changes: counting.length, job: jobId }); continue; }

  const first = counting[0], last = list[list.length - 1];
  const redFirstPrev = val(first, SCF.redPrev) === "" ? val(first, SCF.redRev) : val(first, SCF.redPrev);
  const atPermit = cons(num(val(first, SCF.hardPrev)), num(val(first, SCF.capPrev)), num(redFirstPrev));
  const now = cons(num(val(last, SCF.hardRev)), num(val(last, SCF.capRev)), num(val(last, SCF.redRev)));
  const amount = Math.round((now - atPermit) * 100) / 100;
  const family = job ? String(val(job, JF.family)) : "";
  const consStatus = job ? String(val(job, JF.cons)) : "";
  const structure = job ? iso(val(job, JF.structure)) : "";
  const status = amount < 0 ? "Refund — money back to us"
    : amount === 0 ? "Not Required"
    : /closed|complete|closeout/i.test(consStatus) ? "Verify — job closed"
    : family === "RECON" && !structure ? "Waiting — Structure not passed"
    : "Required — Pending";

  /* self-check against rows that already exist for this case */
  const existing = rows.filter((r) => String(val(r, 7)) === cs && /^\d+$/.test(String(val(r, 6))));
  if (existing.length) {
    check.cases++;
    for (const r of counting) (existing.some((e) => String(val(e, 6)) === String(val(r, SCF.id))) ? check.rowsMatched++ : check.rowsMissed.push(`${cs} ${val(r, SCF.id)}`));
    const e0 = existing[0];
    if (Math.abs(num(val(e0, 24)) - atPermit) < 0.01 && Math.abs(num(val(e0, 25)) - now) < 0.01) check.amountsMatched++;
    else check.amountsOff.push(`${cs}: existing ${money(num(val(e0, 24)))} → ${money(num(val(e0, 25)))}, feed ${money(atPermit)} → ${money(now)}`);
  }

  const inPcoc = rows.filter((x) => String(val(x, 7)) === cs);
  if (inPcoc.length) {
    const newer = counting.filter((r) => !have.has(String(val(r, SCF.id))) && iso(val(r, SCF.approved)) > (inPcoc.map((x) => String(val(x, 11))).sort().pop() || ""));
    const rowNow = num(val(inPcoc[0], 25));
    if (newer.length || Math.abs(rowNow - now) >= 0.01)
      review.push({ cs, rowNow, canopyNow: now, newer: newer.map((r) => `${val(r, SCF.id)} (${iso(val(r, SCF.approved))})`).join(", ") });
    continue;
  }
  for (const r of counting) {
    results.push({
      cs, scopeChangeId: String(val(r, SCF.id)), type: val(r, SCF.type), approved: iso(val(r, SCF.approved)),
      permitFiled: permit, permitFrom: permitKey, permitNo: job ? String(val(job, JF.permitNo)) : "", family, constructionStatus: consStatus,
      structure, municipality: String(val(r, SCF.muni)), atPermit, now, amount, status,
      newCase: !rows.some((x) => String(val(x, 7)) === cs), job: jobId,
    });
  }
}

results.sort((a, b) => (a.status.localeCompare(b.status)) || b.approved.localeCompare(a.approved));
mkdirSync(OUT, { recursive: true });
const cols = ["cs", "scopeChangeId", "type", "approved", "permitFiled", "permitFrom", "permitNo", "family", "constructionStatus", "structure", "municipality", "atPermit", "now", "amount", "status", "newCase", "job"];
writeFileSync(join(OUT, "pcoc-feed-dry-run.csv"),
  [cols.join(","), ...results.map((r) => cols.map((c) => `"${String(r[c] ?? "").replace(/"/g, '""')}"`).join(","))].join("\n"));

const byStatus = results.reduce((o, r) => ((o[r.status] = (o[r.status] || 0) + 1), o), {});
const cases = new Set(results.map((r) => r.cs)), newCases = new Set(results.filter((r) => r.newCase).map((r) => r.cs));
const md = [
  `# PCOC feed — dry run (${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC)`,
  "", "Nothing was written to Quickbase.", "",
  "## Self-check against the rows that already exist",
  `- Cases compared: ${check.cases}`,
  `- Existing scope-change rows the rules reproduce: ${check.rowsMatched}${check.rowsMissed.length ? ` (rules would add ${check.rowsMissed.length} more on those cases: ${check.rowsMissed.slice(0, 10).join("; ")})` : ""}`,
  `- At-permit / now amounts that match the existing rows: ${check.amountsMatched} of ${check.cases}`,
  ...(check.amountsOff.length ? ["", "Amounts that differ (Canopy has moved since the import, or the rule differs):", ...check.amountsOff.slice(0, 25).map((s) => `- ${s}`)] : []),
  "", "## What the feed would add",
  `- Rows: **${results.length}** across **${cases.size}** cases (${newCases.size} cases not in PCOC yet)`,
  ...Object.entries(byStatus).map(([k, v]) => `- ${k}: ${v}`),
  `- Cases skipped because the job has no permit filed date: ${noPermit.length}`,
  "", "| Case | Scope change | Approved | Permit filed | Family | Construction | Structure | Town | At permit | Now | Amount | Status | New case |",
  "|---|---|---|---|---|---|---|---|---:|---:|---:|---|---|",
  ...results.map((r) => `| ${r.cs} | ${r.scopeChangeId} ${r.type} | ${r.approved} | ${r.permitFiled} | ${r.family} | ${r.constructionStatus} | ${r.structure || "—"} | ${r.municipality} | ${money(r.atPermit)} | ${money(r.now)} | ${money(r.amount)} | ${r.status} | ${r.newCase ? "yes" : ""} |`),
  "", "## Cases already in PCOC where Canopy has moved on (review, nothing added)",
  "| Case | PCOC row \"now\" | Canopy now | Newer approved changes |", "|---|---:|---:|---|",
  ...review.map((x) => `| ${x.cs} | ${money(x.rowNow)} | ${money(x.canopyNow)} | ${x.newer || "—"} |`),
  "", "## Skipped: no permit filed date on the job",
  ...noPermit.map((x) => `- ${x.cs} (job ${x.job || "none"}, ${x.changes} construction change${x.changes === 1 ? "" : "s"})`),
];
writeFileSync(join(OUT, "pcoc-feed-dry-run.md"), md.join("\n"));
console.log(JSON.stringify({ wouldAddRows: results.length, cases: cases.size, newCases: newCases.size, byStatus, review: review.length, noPermitDate: noPermit.length, selfCheck: { cases: check.cases, rowsMatched: check.rowsMatched, rowsExtra: check.rowsMissed.length, amountsMatched: check.amountsMatched, amountsOff: check.amountsOff.length } }, null, 1));
