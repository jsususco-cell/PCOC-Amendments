import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Empty, Pill } from "./ui";
import { cases, money, pathOf } from "@/lib/engine";

interface Review { cs: string; rowNow: number; canopyNow: number; difference: number; newer: string[] }
interface Plan { at: string; rows: { cs: string }[]; cases: string[]; review: Review[]; noPermitDate: string[] }

/**
 * Cases already in PCOC whose construction cost in Canopy has moved since
 * their PCOC row was written. Flag only: the feed never changes these, a
 * person decides (2026-10-07).
 */
export default function CanopyFlags() {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    fetch("/api/feed", { credentials: "same-origin" })
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || `Error ${r.status}`); return j as Plan; })
      .then(setPlan).catch((e: Error) => setErr(e.message));
  }, []);

  return (
    <section className="card overflow-x-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3.5">
        <div>
          <h2 className="m-0 text-base font-bold">Canopy changed after the PCOC row was made</h2>
          <div className="text-xs text-mute">The construction cost in Canopy is not what the case's PCOC row says. Nothing is changed by itself: check the case and update it if needed.</div>
        </div>
        {plan && <Pill tone={plan.review.length ? "wait" : "ok"}>{plan.review.length} case{plan.review.length === 1 ? "" : "s"}</Pill>}
      </div>
      {err ? <Empty>Could not check Canopy: {err}</Empty>
        : !plan ? <p className="flex items-center gap-2 px-4 py-5 text-sm text-mute"><Loader2 className="h-4 w-4 animate-spin" />Comparing with Canopy…</p>
        : plan.review.length === 0 ? <Empty>Every case matches Canopy.</Empty> : (
          <table className="w-full border-collapse">
            <thead><tr><th className="th">Case</th><th className="th">Step</th><th className="th text-right">PCOC row says</th><th className="th text-right">Canopy now</th><th className="th text-right">Difference</th><th className="th">Newer approved changes</th></tr></thead>
            <tbody>
              {plan.review.map((r) => {
                const c = cases().find((x) => x.cs === r.cs);
                return (
                  <tr key={r.cs}>
                    <td className="td">{c ? <Link to={pathOf(c)}><b>{r.cs}</b></Link> : <b>{r.cs}</b>}</td>
                    <td className="td text-xs">{c?.stage ?? "—"}</td>
                    <td className="td text-right">{money(r.rowNow)}</td>
                    <td className="td text-right">{money(r.canopyNow)}</td>
                    <td className={`td text-right font-semibold ${r.difference > 0 ? "text-bad-ink" : "text-ok-ink"}`}>{r.difference > 0 ? "+" : "−"}{money(Math.abs(r.difference))}</td>
                    <td className="td text-xs">{r.newer.join(", ") || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      {plan && (
        <div className="border-t border-line px-4 py-2.5 text-xs text-mute">
          New cases come in every morning from Canopy's scope changes.
          {plan.cases.length ? ` ${plan.cases.length} new case${plan.cases.length === 1 ? " is" : "s are"} waiting for the next run.` : " Nothing new is waiting."}
          {plan.noPermitDate.length ? ` ${plan.noPermitDate.length} case${plan.noPermitDate.length === 1 ? " has" : "s have"} changes but no permit date on the job yet, so they are not added.` : ""}
        </div>
      )}
    </section>
  );
}
