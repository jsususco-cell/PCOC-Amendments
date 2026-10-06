import { json, requireSession } from "./_lib/auth.js";
import { REALM, TOKEN } from "./_lib/quickbase.js";

/**
 * POST /api/revise   { rid, scope?: {fileName, base64}, rows?, atPermit, now, permitDate, changes }
 *
 * Builds the REVISED Cost Estimate (and Narrative, when the Permitting Helper
 * has one to revise) with the Permitting Helper's own generators, then files
 * them on the PCOC case. The Helper is called server to server with
 * PCOC_SERVICE_SECRET; the browser never holds it.
 *
 * Filed (existing fields only):
 *   rows of the case  47 Revised Cost Estimate (only when it matches Canopy), 87 date
 *   case              12 Revised Narrative (when the Helper made one)
 *                     58 the check, and what each document revises
 *                     35 Original Estimate Link, 34 Original Narrative Link
 */
const CT = "bwdpnd2fh", TID = "bwdhfcec4";
const headers = () => ({ "QB-Realm-Hostname": REALM(), Authorization: `QB-USER-TOKEN ${TOKEN()}`, "Content-Type": "application/json" });

interface Original { kind: string; id: number; date: string | null; total?: number; link: string | null }
interface HelperResult {
  estimate: { base64: string; fileName: string; lines: number; total: number; dropped: number; revises: Original | null };
  narrative: { base64: string; fileName: string; revises: Original | null } | { skipped: string };
}

async function q(from: string, select: number[], where: string) {
  const r = await fetch("https://api.quickbase.com/v1/records/query", { method: "POST", headers: headers(), body: JSON.stringify({ from, select, where }) });
  const j = (await r.json()) as { data?: Record<string, { value: unknown }>[] };
  if (!r.ok) throw new Error(`Quickbase ${from}: ${r.status}`);
  return j.data ?? [];
}
async function upsert(to: string, data: Record<number, { value: unknown }>[]) {
  const r = await fetch("https://api.quickbase.com/v1/records", { method: "POST", headers: headers(), body: JSON.stringify({ to, data }) });
  const j = (await r.json()) as { metadata?: { lineErrors?: Record<string, string[]> } };
  if (!r.ok) throw new Error(`Quickbase ${to}: ${r.status} ${JSON.stringify(j).slice(0, 200)}`);
  if (j.metadata?.lineErrors && Object.keys(j.metadata.lineErrors).length) throw new Error(`Quickbase rejected the save: ${JSON.stringify(j.metadata.lineErrors).slice(0, 300)}`);
}
const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
const mdY = (iso: string | null | undefined) => { const m = String(iso ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[2]}/${m[3]}/${m[1]}` : ""; };
const key = (cs: string) => String(cs ?? "").replace(/\s*\(BR\)\s*$/i, "").trim();

export async function POST(req: Request): Promise<Response> {
  const denied = requireSession(req);
  if (denied) return denied;
  const helper = (process.env.HELPER_URL?.trim() || "https://cost-estimate-pr.vercel.app").replace(/\/$/, "");
  const secret = process.env.PCOC_SERVICE_SECRET?.trim();
  if (!secret) return json({ error: "PCOC_SERVICE_SECRET is not set on this deployment." }, 503);

  let body: { rid?: number; scope?: { fileName: string; base64: string }; rows?: unknown[]; atPermit?: number; now?: number; permitDate?: string; changes?: string[] };
  try { body = await req.json(); } catch { return json({ error: "Send JSON." }, 400); }
  const rid = Number(body.rid);
  if (!rid) return json({ error: "rid is required." }, 400);

  try {
    const c = (await q(CT, [3, 6], `{3.EX.${rid}}`))[0];
    if (!c) return json({ error: "Case not found." }, 404);
    const cs = String(c[6].value);
    const rows = (await q(TID, [3, 7], `{7.SW.'${key(cs).replace(/'/g, "\\'")}'}`)).filter((r) => key(String(r[7].value)) === key(cs));

    const hr = await fetch(`${helper}/api/permit?action=pcoc-revised`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-pcoc-token": secret },
      body: JSON.stringify({ caseNumber: cs, scope: body.scope, rows: body.rows, atPermit: body.atPermit, now: body.now, permitDate: body.permitDate, changes: body.changes }),
    });
    const hj = (await hr.json().catch(() => ({}))) as HelperResult & { error?: string };
    if (!hr.ok) return json({ error: `Permitting Helper: ${hj.error || hr.status}` }, 502);

    const today = new Date().toISOString().slice(0, 10);
    const now = Number(body.now) || 0;
    const match = Math.abs(hj.estimate.total - now) < 1;
    const est = hj.estimate.revises;
    const estLine = est
      ? `Cost Estimate built by the Permitting Helper; revises its Cost Estimate #${est.id} of ${mdY(est.date)} (${usd(est.total ?? 0)}).`
      : "Cost Estimate built by the Permitting Helper; no earlier Cost Estimate for this case is on file there.";
    const nar = "skipped" in hj.narrative ? null : hj.narrative;
    const narLine = nar
      ? `Narrative built by the Permitting Helper${nar.revises ? `; revises its Project Narrative (row ${nar.revises.id}${nar.revises.date ? `, ${mdY(nar.revises.date)}` : ""})` : ""}.`
      : `Narrative: ${(hj.narrative as { skipped: string }).skipped}`;
    const check = `${match ? "MATCH" : "MISMATCH"} ${mdY(today)}: scope file construction total ${usd(hj.estimate.total)} vs Canopy construction cost now ${usd(now)}`
      + `${match ? "" : ` (difference ${usd(hj.estimate.total - now)}. Use the file for the LATEST approved scope.)`}. ${estLine} ${narLine}`;

    if (match && rows.length) {
      await upsert(TID, rows.map((r) => ({ 3: { value: r[3].value }, 47: { value: { fileName: hj.estimate.fileName, data: hj.estimate.base64 } }, 87: { value: today } })));
    }
    const caseRec: Record<number, { value: unknown }> = { 3: { value: rid }, 58: { value: check } };
    if (nar) caseRec[12] = { value: { fileName: nar.fileName, data: nar.base64 } };
    if (match && est?.link) caseRec[35] = { value: est.link };
    if (nar?.revises?.link) caseRec[34] = { value: nar.revises.link };
    await upsert(CT, [caseRec]);

    return json({
      match, total: hj.estimate.total, now, lines: hj.estimate.lines, estimateSaved: match && rows.length > 0,
      narrative: nar ? "helper" : "skipped", narrativeReason: nar ? null : (hj.narrative as { skipped: string }).skipped,
      revises: { estimate: est, narrative: nar?.revises ?? null }, check,
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 502);
  }
}
