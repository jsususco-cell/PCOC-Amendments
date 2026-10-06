import { useEffect, useState } from "react";

/**
 * Typed doorway to the classic-script engine (public/engine.js + engine-app.js).
 * The engine keeps its state in globals — S.rows (money rows), G.cases, G.visits,
 * G.sf, G.set, G.ob, RATES — exactly as code page 177 did.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const W = window as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Any = any;

export const PC = (): Any => W.PCOC;

export interface Case {
  rid: string; cs: string; muni: string; fam: string; con: string; stage: string; since: string; days: string;
  narr: string; narrOk: string; estOk: string; drw: string; drwReq: string; drwRec: string; sentPA: string;
  npaOn: string; pcoc: string; cnSub: string; cnId: string; cnApp: string; fal: string; falReq: string; falRec: string;
  paid: string; cert: string; stkr: string; sign: string; signOn: string; closeSent: string; closed: string;
  oNarr: string; oEst: string; ho: string; exSf: string; lot: string; model: string; newSf: string; aps: string;
  note: string; holder: string; scx: string; word: string; addr: string; chg: string; issues: string; estChk: string;
  sfStat: string; scopeReq: string; sfUsed: string; dfold: string; dids: string;
}

export interface Row {
  rid: string; sc: string; cs: string; job: string; typ: string; appr: string; permit: string; con: string; st: string;
  arb: string; notes: string; sp: string; fam: string; muni: string; atpermit: number; connow: number; amt: number;
  rate: number; adue: number; calc: string; paid: number; newtot: number; pm: string; pref: string; pby: string;
  pip: boolean; pwho: string; pdate: string; rcpt: string; jc: boolean; jcref: string; card: string; a2pa: number;
  d1: string; d2: string; d3: string; d4: string; l1: string; l2: string; l3: string; l4: string; tokind: string;
  pack: string; packOn: string; estOn: string; prate: number; pdue: number; carb: number; cpat: number;
  letter: string; letterOn: string; sheet: string; sheetOn: string; sentOn: string; addr: string; permitno: string;
}

export const cases = (): Case[] => (W.G?.cases ?? []) as Case[];
export const rows = (): Row[] => (W.S?.rows ?? []) as Row[];
export const rowsOf = (c: Case): Row[] => rows().filter((r) => r.cs === c.cs);

/** Re-render whenever the engine says its data changed. */
export function useEngine(): number {
  const [v, setV] = useState(0);
  useEffect(() => PC().on("change", () => setV((x) => x + 1)), []);
  return v;
}

export function useEngineEvent(ev: string, fn: (d: Any) => void) {
  useEffect(() => PC().on(ev, fn), [ev, fn]);
}

export const CT = "bwdpnd2fh";
export const TID = "bwdhfcec4";
export const caseFile = (c: Case, fid: number) => `/up/${CT}/a/r${c.rid}/e${fid}/v0`;
export const rowFile = (r: Row, fid: number) => `/up/${TID}/a/r${r.rid}/e${fid}/v0`;
export const view = (u: string, title: string) => PC().view(u, title);
export const downloadUrl = (u: string) => W.upUrl(u);

export const money = (n: number): string => W.money(n);
export const us = (iso: string): string => (iso ? W.us(iso) : "");
export const todayIso = (): string => W.gtoday();

export const stageOf = (c: Case): { k: string; n: string; l: string; h: string; d: string } | null => W.stOf(c);
/** Next things to do, in Priscilla's words (engine-app PC.next over page 177's missing()). */
export const missing = (c: Case): string[] => PC().next(c) ?? [];
export const msOf = (c: Case): { structure?: string; substantial?: string; goal?: string } => PC().msOf(c) ?? {};
export const have = (c: Case) => W.have(c) as {
  narr: boolean; narrOk: boolean; est: boolean; estOk: boolean; drw: boolean; drwReq: boolean; npa: boolean;
  rcpt: boolean; to: boolean; fal: boolean; cert: boolean; sign: boolean; paid: boolean;
};
export const owes = (r: Row): boolean => W.owes(r);
export const mailLive = (): boolean => !!W.mailLive?.();
export const lastMail = (c: Case, kind: string) => W.lastMail(c, kind) as { st: string; created: string; sent: string } | null;
export const KIND = (): Record<string, string> => W.KIND;

export const STEPS = [
  { k: "A", n: "A · Prepare request", path: "/prepare", num: "1", label: "Prepare", who: "Priscilla" },
  { k: "B", n: "B · With the PA", path: "/with-pa", num: "2", label: "With the PA", who: "The PA" },
  { k: "C", n: "C · Ready to pay", path: "/pay", num: "3", label: "Pay the town", who: "Priscilla" },
  { k: "D", n: "D · Close-out to PA", path: "/proof", num: "4", label: "Proof to the PA", who: "Priscilla" },
  { k: "E", n: "E · Closing", path: "/close", num: "5", label: "PCOC issued", who: "The PA" },
] as const;

export const PARKED = ["Waiting · Structure not passed", "Finished · confirm with Priscilla", "Refund owed to us"];

export const limitOf = (k: string): number => PC().STAGE_LIMIT[k] ?? 30;
export const daysOf = (c: Case): number => Number(c.days) || 0;
export const overdue = (c: Case): boolean => {
  const s = stageOf(c);
  return !!s && s.k !== "X" && daysOf(c) > limitOf(s.k);
};
export const inStep = (k: string): Case[] =>
  cases().filter((c) => stageOf(c)?.k === k).sort((a, b) => daysOf(b) - daysOf(a));
export const pathOf = (c: Case): string => {
  const s = stageOf(c);
  if (s && s.k !== "X") return STEPS.find((x) => x.k === s.k)!.path + "?case=" + encodeURIComponent(c.cs);
  return "/intake?case=" + encodeURIComponent(c.cs);
};

export const sumRows = (c: Case, f: (r: Row) => number) => rowsOf(c).reduce((t, r) => t + (f(r) || 0), 0);

/** A file field from the money rows reads as "name.pdfhttps://…": keep the name. */
export const fname = (v: string | undefined): string => String(v || "").split(/https?:\/\//)[0];
