import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Search } from "lucide-react";
import { Btn } from "./ui";
import { type Case, cases, daysOf, pathOf, stageOf } from "@/lib/engine";
import { cn } from "@/lib/utils";

export interface FromStep {
  /** e.g. "Intake", "1 · Prepare" */
  label: string;
  list: Case[];
}

/**
 * Case ID box + the cases in this step, oldest first — the same shape as the
 * Permitting Helper's lookup card — plus a dropdown of the cases in the step
 * before, so the next case can be brought in from where it is waiting.
 */
export default function CaseLookup({ queue, selected, onPick, stepKey, from }:
  { queue: Case[]; selected: Case | null; onPick: (cs: string) => void; stepKey: string; from?: FromStep }) {
  const [q, setQ] = useState(selected?.cs ?? "");
  const [msg, setMsg] = useState<{ text: string; link?: string } | null>(null);
  useEffect(() => { setQ(selected?.cs ?? ""); }, [selected?.cs]);

  const look = () => {
    const want = q.trim().toUpperCase();
    if (!want) return;
    const c = cases().find((x) => x.cs.toUpperCase() === want) ?? cases().find((x) => x.cs.toUpperCase().includes(want));
    if (!c) { setMsg({ text: `No PCOC amendment case matches "${q.trim()}".` }); return; }
    const s = stageOf(c);
    const inFrom = !!from?.list.some((x) => x.rid === c.rid);
    if ((!s || s.k !== stepKey) && !inFrom) {
      setMsg({ text: `${c.cs} is not in this step. It is at: ${c.stage}.`, link: pathOf(c) });
      return;
    }
    setMsg(null);
    onPick(c.cs);
  };

  return (
    <section className="card p-5">
      <label htmlFor="cs" className="text-sm font-semibold">Case ID</label>
      <p className="mb-2.5 mt-0.5 text-xs text-mute">
        Type a case number, pick one of the cases in this step{from ? `, or bring one in from ${from.label}` : ""}.
      </p>
      <div className="flex max-w-[960px] flex-wrap gap-2">
        <form className="flex min-w-[18rem] flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); look(); }}>
          <input id="cs" className="input flex-1" value={q} placeholder="PR-SFM-03028" onChange={(e) => setQ(e.target.value)} />
          <Btn type="submit"><Search className="h-4 w-4" />Look up</Btn>
        </form>
        {from && (
          <label className="flex items-center gap-2">
            <span className="sr-only">Bring in a case from {from.label}</span>
            <ArrowRight className="h-4 w-4 text-mute" aria-hidden />
            <select className="input min-w-[16rem]" value="" disabled={!from.list.length}
              onChange={(e) => { if (e.target.value) { setMsg(null); onPick(e.target.value); } }}>
              <option value="">{from.list.length ? `From ${from.label} (${from.list.length})…` : `Nothing in ${from.label}`}</option>
              {from.list.map((c) => (
                <option key={c.rid} value={c.cs}>{c.cs} · {c.muni || "—"} · {c.stage} · {daysOf(c)} d</option>
              ))}
            </select>
          </label>
        )}
      </div>
      {msg && (
        <p className="mt-2 text-[13px] text-bad-ink">
          {msg.text} {msg.link && <Link to={msg.link}>Open it there</Link>}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-mute">{queue.length ? "In this step, oldest first:" : "No cases are in this step right now."}</span>
        {queue.map((c) => (
          <button key={c.rid} onClick={() => { setMsg(null); onPick(c.cs); }}
            className={cn("inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-semibold text-navy",
              selected?.rid === c.rid ? "border-navy bg-navy-50" : "border-[#cfd6e2] bg-white hover:border-navy")}>
            {c.cs} · {daysOf(c)} d
          </button>
        ))}
      </div>
    </section>
  );
}

/** Shown on a case card when the case is still in the step before this one. */
export function FromBanner({ c, stepKey, children }: { c: Case; stepKey: string; children?: React.ReactNode }) {
  const s = stageOf(c);
  if (s && s.k === stepKey) return null;
  return (
    <div className="mx-5 mb-3.5 flex flex-wrap items-center gap-3 rounded-[10px] border border-[#bfdbfe] bg-[#eff6ff] px-3.5 py-2.5 text-sm">
      <span>This case is still at <b>{c.stage}</b>.</span>
      {children}
    </div>
  );
}

export const INTAKE_STAGES = ["Waiting · Structure not passed", "Finished · confirm with Priscilla", "Refund owed to us", "Not required"];
