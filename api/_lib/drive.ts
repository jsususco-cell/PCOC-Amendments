/**
 * Copies a case's papers from Quickbase into Google Drive: one folder per case
 * number, under the PCOC root folder (n8n workflows "PCOC → Drive: Case Folder"
 * and "PCOC → Drive: File Paper", scripts/provision-drive.mjs).
 *
 * Quickbase stays the record. Drive gets a copy so the team finds every paper
 * of a case in one place. Each Drive copy is tagged with the Quickbase
 * attachment it came from (table/record/field) and its version, so a sync
 * only sends what is new or changed, and a rebuilt paper replaces its old
 * copy (same Drive link) instead of piling up.
 */
import { REALM, TOKEN } from "./quickbase.js";

const N8N = () => (process.env.N8N_URL?.trim() || "https://n8n.byrdsonservices.com").replace(/\/$/, "");
const SECRET = () => process.env.PCOC_DRIVE_TOKEN?.trim() ?? "";
export const driveConfigured = () => SECRET() !== "";

const CT = "bwdpnd2fh", TID = "bwdhfcec4";
/** The papers of a case. Generated files sit on the case's first scope-change row, uploads may sit on any row. */
const CASE_FILES: [number, string][] = [
  [12, "Project Narrative"], [54, "Project Narrative (Word)"], [15, "Revised Drawings"], [24, "Final Acceptance Letter"],
  [28, "Town letter"], [30, "Sign photo"],
];
const ROW_FILES: [number, string][] = [
  [47, "Cost Estimate"], [46, "Permit Amendment Notification"], [48, "Original tax receipt"], [66, "Calculation sheet"],
  [61, "Letter to the town"], [71, "Print pack"], [38, "Payment receipt"], [68, "Task order"],
];

const headers = () => ({ "QB-Realm-Hostname": REALM(), Authorization: `QB-USER-TOKEN ${TOKEN()}`, "Content-Type": "application/json" });
type FileVal = { versions?: { versionNumber: number; fileName: string }[] } | string | null | undefined;
type Rec = Record<string, { value: unknown }>;

async function query(from: string, select: number[], where: string): Promise<Rec[]> {
  const r = await fetch("https://api.quickbase.com/v1/records/query", { method: "POST", headers: headers(), body: JSON.stringify({ from, select, where, options: { top: 1000 } }) });
  const j = (await r.json()) as { data?: Rec[]; message?: string };
  if (!r.ok) throw new Error(`Quickbase ${from}: ${r.status} ${j.message ?? ""}`);
  return j.data ?? [];
}
const caseKey = (cs: string) => String(cs ?? "").replace(/\s*\(BR\)\s*$/i, "").trim();

export interface Paper { key: string; version: number; table: string; rid: number; fid: number; label: string; fileName: string; driveName: string }

function latest(v: FileVal) {
  if (!v || typeof v !== "object" || !v.versions?.length) return null;
  return v.versions[v.versions.length - 1];
}
const MIME: Record<string, string> = {
  pdf: "application/pdf", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", doc: "application/msword",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", xls: "application/vnd.ms-excel",
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", heic: "image/heic", gif: "image/gif", webp: "image/webp",
};
const mimeOf = (name: string) => MIME[(name.split(".").pop() || "").toLowerCase()] || "application/octet-stream";

/** Every paper on a case, newest version of each attachment. */
export async function papersOf(rid: number): Promise<{ cs: string; papers: Paper[] }> {
  const c = (await query(CT, [3, 6, ...CASE_FILES.map(([f]) => f)], `{3.EX.${rid}}`))[0];
  if (!c) throw new Error("Case not found.");
  const cs = String(c[6].value);
  const rows = (await query(TID, [3, 6, 7, ...ROW_FILES.map(([f]) => f)], `{7.SW.'${caseKey(cs).replace(/'/g, "\\'")}'}`))
    .filter((r) => caseKey(String(r[7].value)) === caseKey(cs));
  const papers: Paper[] = [];
  const add = (table: string, rec: Rec, fid: number, label: string, sc?: string) => {
    const v = latest(rec[fid]?.value as FileVal);
    if (!v) return;
    const fileName = v.fileName || `${label}.pdf`;
    const named = fileName.toUpperCase().includes(caseKey(cs).toUpperCase());
    const base = named ? fileName : `${caseKey(cs)} - ${label}${sc ? ` (${sc})` : ""} - ${fileName}`;
    papers.push({ key: `${table}/${rec[3].value}/${fid}`, version: v.versionNumber, table, rid: Number(rec[3].value), fid, label, fileName, driveName: base });
  };
  CASE_FILES.forEach(([fid, label]) => add(CT, c, fid, label));
  rows.forEach((r) => ROW_FILES.forEach(([fid, label]) => add(TID, r, fid, label, rows.length > 1 ? String(r[6]?.value ?? "") : undefined)));
  /* Two papers can carry the same file name (two scope changes, or the same file put in two fields):
     tell them apart by the kind of paper, then by the scope change. */
  const sc = new Map(rows.map((r) => [Number(r[3].value), String(r[6]?.value ?? "")]));
  const tag = (p: Paper, t: string) => {
    const dot = p.driveName.lastIndexOf(".");
    p.driveName = dot > 0 ? `${p.driveName.slice(0, dot)} (${t})${p.driveName.slice(dot)}` : `${p.driveName} (${t})`;
  };
  const dupes = () => {
    const n = new Map<string, number>();
    papers.forEach((p) => n.set(p.driveName, (n.get(p.driveName) ?? 0) + 1));
    return papers.filter((p) => (n.get(p.driveName) ?? 0) > 1);
  };
  dupes().forEach((p) => tag(p, p.label));
  dupes().forEach((p) => { if (p.table === TID && sc.get(p.rid)) tag(p, `scope change ${sc.get(p.rid)}`); });
  return { cs: caseKey(cs), papers };
}

async function hook<T>(path: string, body: object, timeoutMs = 60_000): Promise<T> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(`${N8N()}/webhook/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, signal: ctl.signal, body: JSON.stringify({ ...body, secret: SECRET() }) });
    const text = await r.text();
    let j: (T & { ok?: boolean; error?: string }) | null = null;
    try { j = JSON.parse(text); } catch { /* below */ }
    if (!r.ok || !j || j.ok === false) throw new Error(`Drive (${path}): ${j?.error || r.status} ${j ? "" : text.slice(0, 120)}`.trim());
    return j;
  } finally {
    clearTimeout(t);
  }
}

interface FolderResult { folderId: string | null; folderLink: string | null; files: { id: string; name: string; appProperties?: { pcocKey?: string; pcocVersion?: string } }[] }

/** The case's Drive folder (created when `create`), and what is in it. */
export const caseFolder = (cs: string, create: boolean) => hook<FolderResult>("pcoc-drive-folder", { caseNumber: caseKey(cs), create });

export interface SyncResult { cs: string; folderLink: string | null; filed: string[]; replaced: string[]; unchanged: number; errors: string[] }

/** Copy what is new or changed. Sequential, so two uploads never race to create the same folder. */
export async function syncCase(rid: number): Promise<SyncResult> {
  if (!driveConfigured()) throw new Error("PCOC_DRIVE_TOKEN is not set on this deployment.");
  const { cs, papers } = await papersOf(rid);
  const out: SyncResult = { cs, folderLink: null, filed: [], replaced: [], unchanged: 0, errors: [] };
  if (!papers.length) {
    out.folderLink = (await caseFolder(cs, false)).folderLink;
    return out;
  }
  const folder = await caseFolder(cs, true);
  out.folderLink = folder.folderLink;
  if (!folder.folderId) throw new Error("Drive did not return the case folder.");
  for (const p of papers) {
    const have = folder.files.find((f) => f.appProperties?.pcocKey === p.key);
    if (have && have.appProperties?.pcocVersion === String(p.version) && have.name === p.driveName) { out.unchanged++; continue; }
    try {
      const r = await fetch(`https://api.quickbase.com/v1/files/${p.table}/${p.rid}/${p.fid}/${p.version}`, { headers: headers() });
      if (!r.ok) throw new Error(`Quickbase file ${r.status}`);
      const fileBase64 = (await r.text()).trim();
      await hook("pcoc-drive-file", {
        folderId: folder.folderId, fileName: p.driveName, mimeType: mimeOf(p.fileName), fileBase64,
        key: p.key, version: p.version, fileId: have?.id ?? "",
      }, 120_000);
      (have ? out.replaced : out.filed).push(p.driveName);
    } catch (e) {
      out.errors.push(`${p.label}: ${(e as Error).message}`);
    }
  }
  return out;
}

/** All cases, oldest work first, within a time budget (the nightly pass). */
export async function syncAll(budgetMs = 250_000): Promise<{ done: number; total: number; filed: number; replaced: number; errors: string[] }> {
  const t0 = Date.now();
  const all = await query(CT, [3, 6], "{3.GT.0}");
  /* Start somewhere else each night, so a night that runs out of time does
     not always leave the same cases for last. */
  const start = all.length ? (Math.floor(Date.now() / 864e5) * 17) % all.length : 0;
  const cases = [...all.slice(start), ...all.slice(0, start)];
  const sum = { done: 0, total: cases.length, filed: 0, replaced: 0, errors: [] as string[] };
  for (const c of cases) {
    if (Date.now() - t0 > budgetMs) break;
    try {
      const r = await syncCase(Number(c[3].value));
      sum.filed += r.filed.length; sum.replaced += r.replaced.length;
      r.errors.forEach((e) => sum.errors.push(`${r.cs}: ${e}`));
    } catch (e) {
      sum.errors.push(`${String(c[6].value)}: ${(e as Error).message}`);
    }
    sum.done++;
  }
  return sum;
}
