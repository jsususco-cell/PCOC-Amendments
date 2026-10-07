import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { RefreshCw, Search } from "lucide-react";
import { Btn, EDGE, Empty, Kpi, PageTitle, Pill } from "@/components/ui";
import CanopyFlags from "@/components/CanopyFlags";
import { PARKED, PC, STEPS, cases, daysOf, inStep, limitOf, missing, msOf, overdue, pathOf, stageOf, useEngine } from "@/lib/engine";

export default function Board() {
  useEngine();
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState("");
  const all = cases();
  const work = all.filter((c) => { const s = stageOf(c); return s && s.k !== "X" && s.k !== "I"; });
  const late = work.filter(overdue).sort((a, b) => daysOf(b) - limitOf(stageOf(b)!.k) - (daysOf(a) - limitOf(stageOf(a)!.k)));
  const parked = all.filter((c) => PARKED.includes(c.stage));
  const closed = all.filter((c) => c.stage === "Closed").length;
  const notReq = all.filter((c) => c.stage === "Not required").length;
  const last = PC().lastUpkeep();

  const find = (e: React.FormEvent) => {
    e.preventDefault();
    const w = q.trim().toUpperCase();
    const c = all.find((x) => x.cs.toUpperCase() === w) ?? all.find((x) => x.cs.toUpperCase().includes(w));
    if (!c) { setMsg(`No case matches "${q.trim()}".`); return; }
    setMsg("");
    nav(pathOf(c));
  };

  return (
    <>
      <PageTitle title="Board">
        <form onSubmit={find} className="flex items-center gap-2">
          <input className="input w-56" placeholder="Case ID" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a case" />
          <Btn type="submit" kind="outline"><Search className="h-4 w-4" />Find</Btn>
        </form>
      </PageTitle>
      <p className="-mt-3 text-[13px] text-mute">
        Every case, the step it is in, who has it and how long. Click a case to open it in its step.
        {msg && <span className="ml-2 text-bad-ink">{msg}</span>}
      </p>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Cases to work" value={work.length} sub="in Steps 1 to 5" edge={EDGE.navy} />
        <Kpi label="Past the time limit" value={late.length} sub="see the stuck list below" edge={EDGE.red} />
        <Kpi label="Parked" value={parked.length} sub={PARKED.map((p) => `${all.filter((c) => c.stage === p).length} ${p.split(" ")[0].toLowerCase()}`).join(" · ")} edge={EDGE.amber} />
        <Kpi label="Done" value={closed + notReq} sub={`${closed} closed · ${notReq} not required`} edge={EDGE.green} />
      </div>

      <div className="grid grid-cols-1 gap-2.5 md:grid-cols-5">
        {STEPS.map((s) => {
          const L = inStep(s.k);
          return (
            <div key={s.k} className="card flex min-h-[220px] flex-col">
              <div className="flex flex-col gap-0.5 border-b border-line px-3.5 py-3">
                <Link to={s.path} className="font-bold no-underline">{s.num} · {s.label}</Link>
                <span className="text-xs text-mute">{s.who} · limit {limitOf(s.k)} days</span>
                <span className="text-lg font-bold tnum">{L.length}</span>
              </div>
              {L.length === 0 && <Empty>Nothing here.</Empty>}
              {L.slice(0, 4).map((c) => (
                <Link key={c.rid} to={pathOf(c)} className="mx-2.5 mt-2 block rounded-[10px] border border-line px-3 py-2.5 text-ink no-underline hover:border-navy">
                  <b>{c.cs}</b>
                  <div className="text-xs text-mute">{c.muni || "—"}</div>
                  <div className="mt-1.5 flex flex-wrap gap-1"><Pill tone={overdue(c) ? "bad" : daysOf(c) > limitOf(s.k) / 2 ? "wait" : "grey"}>{daysOf(c)} days</Pill>{s.k === "A" && !msOf(c).substantial && <Pill tone="wait">heads-up</Pill>}</div>
                </Link>
              ))}
              {L.length > 4 && <Link to={s.path} className="block px-3.5 py-2.5 text-[12.5px]">+ {L.length - 4} more</Link>}
            </div>
          );
        })}
      </div>

      <section className="card overflow-x-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3.5">
          <div>
            <h2 className="m-0 text-base font-bold">Stuck: past the time limit</h2>
            <div className="text-xs text-mute">Furthest over first.</div>
          </div>
          <Pill tone={late.length ? "bad" : "ok"}>{late.length} case{late.length === 1 ? "" : "s"}</Pill>
        </div>
        {late.length === 0 ? <Empty>No case is past its time limit.</Empty> : (
          <table className="w-full border-collapse">
            <thead><tr><th className="th">Case</th><th className="th">Step</th><th className="th text-right">Days in step</th><th className="th text-right">Limit</th><th className="th">Who has it</th><th className="th">Next thing to do</th></tr></thead>
            <tbody>
              {late.map((c) => {
                const s = STEPS.find((x) => x.k === stageOf(c)!.k)!;
                return (
                  <tr key={c.rid}>
                    <td className="td"><Link to={pathOf(c)}><b>{c.cs}</b></Link><div className="text-xs text-mute">{c.muni}</div></td>
                    <td className="td"><Pill tone="navy">{s.num} · {s.label}</Pill></td>
                    <td className="td text-right font-bold text-bad-ink">{daysOf(c)}</td>
                    <td className="td text-right">{limitOf(s.k)}</td>
                    <td className="td">{s.who}</td>
                    <td className="td">{missing(c)[0] ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <CanopyFlags />

      <div className="flex flex-wrap items-center gap-3 text-xs text-mute">
        <Btn kind="outline" onClick={() => PC().upkeep()}><RefreshCw className="h-4 w-4" />Sync now</Btn>
        <span>
          Sync adds new cases from Canopy scope changes, stamps dates from sent emails, reads new scope files, builds documents and writes reminders.
          {" "}Last run in this browser: {last ? new Date(last).toLocaleString() : "never"}. It runs by itself every 6 hours when the app is open.
        </span>
      </div>
    </>
  );
}
