/**
 * PCOC feed: Canopy scope changes → new PCOC cases.
 *
 * Source: "Canopy - Scope Changes" (bv45sinpu), refreshed from Canopy's export.
 * Rules (follow Jim's Sep 2026 import; checked against it, see scripts/feed-dry-run.mjs):
 *   - a scope change counts when it is Approved, approved AFTER the job's permit
 *     date, and changed the construction cost = Hard + Cap Exception − Scope
 *     Reduction (temporary relocation, soft costs, taxes, task order do not count);
 *   - At Permit = amounts before the first counting change; Now = amounts after
 *     the latest approved change of the case;
 *   - starting status: < 0 Refund · = 0 Not Required · job closed → Verify —
 *     job closed · RECON without Structure → Waiting · else Required — Pending.
 *
 * What it does (decided 2026-10-07):
 *   - ADDS cases that have no PCOC row yet (refunds included): one money row per
 *     counting scope change, plus the case record, so the case shows in Intake;
 *   - NEVER changes a case already in PCOC. When Canopy has moved on for one, it
 *     is only FLAGGED (returned in `review`, shown in the app).
 */
import { REALM, TOKEN } from "./quickbase.js";

const T = { SC: "bv45sinpu", ROWS: "bwdhfcec4", CASES: "bwdpnd2fh", JOBS: "buskqh27b", RATES: "bwa36idkq" };
const SCF = { id: 6, cs: 7, type: 15, status: 16, toPrev: 19, toChg: 20, toRev: 21, softPrev: 24, softRev: 26,
  hardPrev: 27, hardRev: 29, capPrev: 30, capRev: 32, taxPrev: 33, taxRev: 35, tempPrev: 36, tempRev: 38,
  redPrev: 39, redRev: 41, muni: 46, addr: 47, approved: 68, job: 73 } as const;
const JF = { permitFiled: 1701, permitClockFiled: 1719, permitOnPermit: 1791, permitClockIssued: 1720,
  permitNo: 1143, family: 1556, cons: 1116, structure: 1365 } as const;
const PERMIT_ORDER = ["permitFiled", "permitClockFiled", "permitOnPermit", "permitClockIssued"] as const;

type Rec = Record<string, { value: unknown }>;
const headers = () => ({ "QB-Realm-Hostname": REALM(), Authorization: `QB-USER-TOKEN ${TOKEN()}`, "Content-Type": "application/json" });

async function all(from: string, select: number[], where?: string): Promise<Rec[]> {
  let out: Rec[] = [], skip = 0;
  for (;;) {
    const r = await fetch("https://api.quickbase.com/v1/records/query", { method: "POST", headers: headers(),
      body: JSON.stringify({ from, select, where, options: { skip, top: 1000 } }) });
    const j = (await r.json()) as { data?: Rec[] };
    if (!r.ok) throw new Error(`Quickbase ${from}: ${r.status} ${JSON.stringify(j).slice(0, 200)}`);
    out = out.concat(j.data ?? []);
    if (!j.data || j.data.length < 1000) return out;
    skip += 1000;
  }
}

/** Quickbase answers 200 even when it rejected a line: check lineErrors. */
async function upsert(to: string, data: Record<number, { value: unknown }>[], fieldsToReturn: number[] = [3]) {
  const r = await fetch("https://api.quickbase.com/v1/records", { method: "POST", headers: headers(),
    body: JSON.stringify({ to, data, fieldsToReturn }) });
  const j = (await r.json()) as { data?: Rec[]; metadata?: { lineErrors?: Record<string, string[]>; createdRecordIds?: number[] } };
  if (!r.ok) throw new Error(`Quickbase ${to}: ${r.status} ${JSON.stringify(j).slice(0, 300)}`);
  const le = j.metadata?.lineErrors;
  if (le && Object.keys(le).length) throw new Error(`Quickbase rejected rows in ${to}: ${JSON.stringify(le).slice(0, 400)}`);
  return j;
}

const val = (r: Rec | undefined, f: number): unknown => {
  const v = r?.[f]?.value;
  return Array.isArray(v) ? v.filter(Boolean).pop() ?? "" : v ?? "";
};
const str = (r: Rec | undefined, f: number) => String(val(r, f) ?? "").trim();
const num = (v: unknown) => Number(String(v ?? "").replace(/[$,]/g, "")) || 0;
/** Canopy dates are "DD/MM/YYYY HH:MM"; Quickbase dates are ISO. */
export const isoDate = (v: unknown): string => {
  const s = String(v ?? "").trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : "";
};
const round = (n: number) => Math.round(n * 100) / 100;
const cons = (h: number, c: number, red: number) => round(h + c - red);
export const money = (n: number) => (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export interface NewRow {
  cs: string; scopeChangeId: string; type: string; approved: string; permitDate: string; permitFrom: string;
  permitNo: string; family: string; constructionStatus: string; structure: string; municipality: string; address: string;
  job: number | null; toChange: number; atPermit: number; now: number; amount: number; status: string;
  buckets: Record<number, number>;
}
export interface Review { cs: string; rowNow: number; canopyNow: number; difference: number; newer: string[] }
export interface Plan {
  at: string; rows: NewRow[]; cases: string[]; review: Review[]; noPermitDate: string[];
  check: { cases: number; amountsMatched: number; amountsOff: string[] };
}

export async function buildPlan(): Promise<Plan> {
  const [scAll, rows] = await Promise.all([
    all(T.SC, Object.values(SCF)),
    all(T.ROWS, [6, 7, 11, 24, 25]),
  ]);
  const jobIds = [...new Set(scAll.map((r) => str(r, SCF.job)).filter(Boolean))];
  const jobs: Record<string, Rec> = {};
  for (let i = 0; i < jobIds.length; i += 80) {
    const where = jobIds.slice(i, i + 80).map((id) => `{3.EX.${id}}`).join("OR");
    for (const j of await all(T.JOBS, [3, ...Object.values(JF)], where)) jobs[String(j[3].value)] = j;
  }
  const byCase: Record<string, Rec[]> = {};
  for (const r of scAll) {
    if (!/^approved$/i.test(str(r, SCF.status))) continue;
    const cs = str(r, SCF.cs); if (!cs) continue;
    (byCase[cs] = byCase[cs] || []).push(r);
  }
  const plan: Plan = { at: new Date().toISOString(), rows: [], cases: [], review: [], noPermitDate: [], check: { cases: 0, amountsMatched: 0, amountsOff: [] } };

  for (const [cs, list] of Object.entries(byCase)) {
    list.sort((a, b) => isoDate(val(a, SCF.approved)).localeCompare(isoDate(val(b, SCF.approved))));
    const job = jobs[str(list[0], SCF.job)];
    const permitFrom = job ? PERMIT_ORDER.find((k) => isoDate(val(job, JF[k]))) ?? "" : "";
    const permit = permitFrom ? isoDate(val(job, JF[permitFrom as keyof typeof JF])) : "";
    const redPrevOf = (r: Rec) => (str(r, SCF.redPrev) === "" ? val(r, SCF.redRev) : val(r, SCF.redPrev));
    const counting = list.filter((r) => {
      const d = isoDate(val(r, SCF.approved));
      const delta = cons(num(val(r, SCF.hardRev)), num(val(r, SCF.capRev)), num(val(r, SCF.redRev)))
        - cons(num(val(r, SCF.hardPrev)), num(val(r, SCF.capPrev)), num(redPrevOf(r)));
      return d && (!permit || d > permit) && Math.abs(delta) >= 0.01;
    });
    if (!counting.length) continue;
    if (!permit) { plan.noPermitDate.push(cs); continue; }

    const first = counting[0], last = list[list.length - 1];
    const atPermit = cons(num(val(first, SCF.hardPrev)), num(val(first, SCF.capPrev)), num(redPrevOf(first)));
    const now = cons(num(val(last, SCF.hardRev)), num(val(last, SCF.capRev)), num(val(last, SCF.redRev)));
    const amount = round(now - atPermit);

    const inPcoc = rows.filter((x) => str(x, 7) === cs);
    if (inPcoc.length) {
      const numeric = inPcoc.filter((x) => /^\d+$/.test(str(x, 6)));
      if (numeric.length) {
        plan.check.cases++;
        const e0 = numeric[0];
        if (Math.abs(num(val(e0, 24)) - atPermit) < 0.01 && Math.abs(num(val(e0, 25)) - now) < 0.01) plan.check.amountsMatched++;
        else plan.check.amountsOff.push(`${cs}: PCOC ${money(num(val(e0, 24)))} → ${money(num(val(e0, 25)))}, Canopy ${money(atPermit)} → ${money(now)}`);
      }
      const known = new Set(inPcoc.map((x) => str(x, 6)));
      const lastRowDate = inPcoc.map((x) => str(x, 11)).sort().pop() || "";
      const newer = counting.filter((r) => !known.has(str(r, SCF.id)) && isoDate(val(r, SCF.approved)) > lastRowDate)
        .map((r) => `${str(r, SCF.id)} (${isoDate(val(r, SCF.approved))})`);
      const rowNow = num(val(inPcoc[0], 25));
      if (Math.abs(rowNow - now) >= 0.01) plan.review.push({ cs, rowNow, canopyNow: now, difference: round(now - rowNow), newer });
      continue;
    }

    const family = job ? str(job, JF.family) : "";
    const consStatus = job ? str(job, JF.cons) : "";
    const structure = job ? isoDate(val(job, JF.structure)) : "";
    const status = amount < 0 ? "Refund — money back to us"
      : amount === 0 ? "Not Required"
      : /closed|complete|closeout/i.test(consStatus) ? "Verify — job closed"
      : family === "RECON" && !structure ? "Waiting — Structure not passed"
      : "Required — Pending";
    const pair = (p: number, rv: number) => [num(val(first, p)), num(val(last, rv))];
    const [hA, hN] = pair(SCF.hardPrev, SCF.hardRev), [cA, cN] = pair(SCF.capPrev, SCF.capRev),
      [sA, sN] = pair(SCF.softPrev, SCF.softRev), [tA, tN] = pair(SCF.tempPrev, SCF.tempRev),
      [xA, xN] = pair(SCF.taxPrev, SCF.taxRev), [oA, oN] = pair(SCF.toPrev, SCF.toRev);
    const rA = num(redPrevOf(first)), rN = num(val(last, SCF.redRev));
    plan.cases.push(cs);
    for (const r of counting) {
      plan.rows.push({
        cs, scopeChangeId: str(r, SCF.id), type: str(r, SCF.type), approved: isoDate(val(r, SCF.approved)),
        permitDate: permit, permitFrom, permitNo: job ? str(job, JF.permitNo) : "", family, constructionStatus: consStatus,
        structure, municipality: str(r, SCF.muni), address: str(r, SCF.addr), job: Number(str(r, SCF.job)) || null,
        toChange: num(val(r, SCF.toChg)), atPermit, now, amount, status,
        buckets: { 73: hA, 74: hN, 75: cA, 76: cN, 77: sA, 78: sN, 79: tA, 80: tN, 81: rA, 82: rN, 83: xA, 84: xN, 85: oA, 86: oN },
      });
    }
  }
  plan.rows.sort((a, b) => a.status.localeCompare(b.status) || b.approved.localeCompare(a.approved));
  plan.review.sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference));
  return plan;
}

/** Case stage for a new case, from its rows (page 177's rowStage, plus Verify → confirm). */
function stageFor(statuses: string[]): string {
  if (statuses.some((s) => /^Required/.test(s))) return "A · Prepare request";
  if (statuses.some((s) => /^Waiting/.test(s))) return "Waiting · Structure not passed";
  if (statuses.some((s) => /^Verify/.test(s))) return "Finished · confirm with Priscilla";
  if (statuses.some((s) => /^Refund/.test(s))) return "Refund owed to us";
  return "Not required";
}

/** Writes the plan's new cases. Never touches an existing case or row. */
export async function applyPlan(plan: Plan): Promise<{ casesAdded: number; rowsAdded: number }> {
  if (!plan.rows.length) return { casesAdded: 0, rowsAdded: 0 };
  const today = new Date().toISOString().slice(0, 10);
  const rates: Record<string, { rate: number; prate: number }> = {};
  for (const r of await all(T.RATES, [6, 8, 14])) rates[str(r, 6)] = { rate: num(val(r, 8)), prate: num(val(r, 14)) };

  // Re-check right before writing: another run may have added the same case.
  const existing = new Set((await all(T.ROWS, [7])).map((r) => str(r, 7)));
  const existingCases = new Set((await all(T.CASES, [6])).map((r) => str(r, 6)));
  const byCase: Record<string, NewRow[]> = {};
  for (const r of plan.rows) if (!existing.has(r.cs)) (byCase[r.cs] = byCase[r.cs] || []).push(r);

  let casesAdded = 0, rowsAdded = 0;
  for (const [cs, list] of Object.entries(byCase)) {
    const r0 = list[0];
    let caseRid: number | null = null;
    if (!existingCases.has(cs)) {
      const rec: Record<number, { value: unknown }> = {
        6: { value: cs }, 7: { value: r0.municipality }, 8: { value: r0.family }, 9: { value: r0.constructionStatus },
        10: { value: stageFor(list.map((x) => x.status)) }, 11: { value: today },
      };
      if (r0.job) rec[67] = { value: r0.job };
      const c = await upsert(T.CASES, [rec]);
      caseRid = Number(c.data?.[0]?.[3]?.value) || null;
      casesAdded++;
    }
    const rt = rates[r0.municipality] || { rate: 0, prate: 0 };
    const adue = round(r0.amount * rt.rate / 100), pdue = round(r0.amount * rt.prate / 100);
    const calc = [
      `AMENDMENT AMOUNT: ${money(r0.amount)}`, "",
      `Construction cost at the permit (${r0.permitDate}): ${money(r0.atPermit)}`,
      `Construction cost now:            ${money(r0.now)}`,
      `${r0.amount < 0 ? "Decrease" : "Increase"} since the permit:        ${money(r0.amount)}`, "",
      rt.rate ? `Arbitrio ${rt.rate}%: ${money(adue)}${rt.prate ? ` · Patente ${rt.prate}%: ${money(pdue)}` : ""}` : `No rate on file yet for ${r0.municipality || "this municipality"}.`,
      "", `Added by the PCOC feed from Canopy on ${today}. Permit date from Jobs field "${r0.permitFrom}".`,
    ].join("\n");
    await upsert(T.ROWS, list.map((r) => {
      const rec: Record<number, { value: unknown }> = {
        6: { value: r.scopeChangeId }, 7: { value: r.cs }, 9: { value: r.type }, 10: { value: r.toChange },
        11: { value: r.approved }, 12: { value: r.permitDate }, 13: { value: r.constructionStatus }, 14: { value: r.status },
        18: { value: today }, 19: { value: `Added by the PCOC feed from Canopy scope change ${r.scopeChangeId} on ${today}.` },
        20: { value: r.structure || "" }, 21: { value: r.family }, 22: { value: r.approved }, 23: { value: r.municipality },
        24: { value: r.atPermit }, 25: { value: r.now }, 26: { value: r.amount },
        27: { value: rt.rate || "" }, 28: { value: rt.rate ? adue : "" }, 54: { value: rt.prate || "" }, 55: { value: rt.prate ? pdue : "" },
        29: { value: calc }, 64: { value: r.address }, 65: { value: r.permitNo },
      };
      if (r.job) { rec[8] = { value: r.job }; rec[91] = { value: r.job }; }
      if (caseRid) rec[88] = { value: caseRid };
      for (const [f, v] of Object.entries(r.buckets)) rec[Number(f)] = { value: v };
      return rec;
    }));
    rowsAdded += list.length;
  }
  return { casesAdded, rowsAdded };
}
