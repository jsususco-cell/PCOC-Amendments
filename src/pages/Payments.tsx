import { useState } from "react";
import { X } from "lucide-react";
import { Btn, EDGE, Empty, Kpi, PageTitle, Pill, useAction } from "@/components/ui";
import { type Row, PC, fname, money, owes, rowFile, rows, us, useEngine, view } from "@/lib/engine";
import { cn } from "@/lib/utils";

const PMETH = ["", "Credit Card", "Company Check", "Cashier's Check", "ACH / Wire", "Cash", "Money Order", "Paid by PA / Expediter"];
const CARDS = ["", "Corporate", "Capital One", "Chase 8413", "Chase 0559", "American Express", "1st Financial", "Robinhood", "Chase Ink"];
type Filter = "all" | "topay" | "paid" | "nojc" | "refund";

export default function Payments() {
  useEngine();
  const R = rows();
  const [q, setQ] = useState("");
  const [f, setF] = useState<Filter>("all");
  const [sel, setSel] = useState<string | null>(null);
  const uniq = (a: Row[]) => new Set(a.map((r) => r.cs)).size;
  const paidRows = R.filter((r) => Number(r.arb) > 0);
  const noJc = paidRows.filter((r) => !r.jcref);

  const L = R.filter((r) =>
    (f === "all" || (f === "topay" && owes(r)) || (f === "paid" && Number(r.arb) > 0) || (f === "nojc" && Number(r.arb) > 0 && !r.jcref) || (f === "refund" && r.amt < 0))
    && (!q || r.cs.toUpperCase().includes(q.toUpperCase()) || (r.muni || "").toUpperCase().includes(q.toUpperCase())))
    .sort((a, b) => (a.muni || "").localeCompare(b.muni || "") || a.cs.localeCompare(b.cs));
  const cur = R.find((r) => r.rid === sel) ?? null;

  const csv = () => {
    const head = ["Case", "Scope change", "Town", "Status", "Added scope", "Rate %", "Arbitrio due", "Patente due", "Paid", "Paid on", "How paid", "Town charged arbitrio", "Town charged patente", "Job cost"];
    const lines = L.map((r) => [r.cs, r.sc, r.muni, r.st, r.amt, r.rate, r.adue, r.pdue, r.arb, r.pdate, r.pm, r.carb, r.cpat, r.jcref]
      .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","));
    const url = URL.createObjectURL(new Blob([[head.join(","), ...lines].join("\n")], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = `PCOC payments ${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  return (
    <>
      <PageTitle title="Payments">
        <div className="flex gap-2">
          <input className="input w-52" placeholder="Search case or town" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
          <Btn kind="outline" onClick={csv}>Export</Btn>
        </div>
      </PageTitle>
      <p className="-mt-3 text-[13px] text-mute">Money for each Canopy scope change. For Priscilla and the managers. Click a row to edit it on the right. The amendment status is never changed here.</p>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Added scope" value={money(R.reduce((t, r) => t + (r.amt || 0), 0))} sub={`${R.length} scope changes · ${uniq(R)} cases`} edge={EDGE.navy} />
        <Kpi label="Tax we expect" value={money(R.reduce((t, r) => t + (r.adue || 0) + (r.pdue || 0), 0))} sub="arbitrios + patentes, our figure" edge={EDGE.amber} />
        <Kpi label="Paid" value={money(paidRows.reduce((t, r) => t + (Number(r.arb) || 0), 0))} sub={`${paidRows.length} scope changes`} edge={EDGE.green} />
        <Kpi label="Paid, no job cost" value={noJc.length} sub="not posted to CC Purchase Submissions" edge={EDGE.red} />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {([["all", "All"], ["topay", "To pay"], ["paid", "Paid"], ["nojc", "Paid, no job cost"], ["refund", "Refunds"]] as [Filter, string][]).map(([k, l]) => (
          <button key={k} onClick={() => setF(k)} className={cn("h-9 rounded-full border px-3.5 text-[13px] font-semibold", f === k ? "border-navy bg-navy text-white" : "border-[#cfd6e2] bg-white text-navy")}>{l}</button>
        ))}
      </div>

      <div className={cn("grid items-start gap-4", cur ? "grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px]" : "grid-cols-1")}>
        <section className="card overflow-x-auto">
          {L.length === 0 ? <Empty>No rows match.</Empty> : (
            <table className="w-full border-collapse">
              <thead><tr><th className="th">Case</th><th className="th">Town</th><th className="th">Status</th><th className="th text-right">Added</th><th className="th text-right">Rate</th><th className="th text-right">Due</th><th className="th text-right">Paid</th><th className="th text-right">Town charged</th><th className="th">Job cost</th></tr></thead>
              <tbody>
                {L.map((r) => {
                  const dueAmt = (r.adue || 0) + (r.pdue || 0), charged = (r.carb || 0) + (r.cpat || 0), paid = Number(r.arb) || 0;
                  return (
                    <tr key={r.rid} onClick={() => setSel(r.rid)} className={cn("cursor-pointer hover:bg-[#fafbfd]", sel === r.rid && "bg-[#f3f6fb]")}>
                      <td className="td"><b>{r.cs}</b><div className="text-xs text-mute">{r.sc}</div></td>
                      <td className="td">{r.muni || "—"}</td>
                      <td className="td text-xs">{r.st}</td>
                      <td className={cn("td text-right", r.amt < 0 && "text-bad-ink")}>{money(r.amt)}</td>
                      <td className="td text-right">{r.rate ? `${r.rate}%` : "—"}</td>
                      <td className={cn("td text-right", dueAmt < 0 && "text-bad-ink")}>{dueAmt < 0 ? `${money(Math.abs(dueAmt))} credit` : money(dueAmt)}</td>
                      <td className="td text-right">{paid ? money(paid) : "—"}</td>
                      <td className="td text-right">{charged ? <>{money(charged)} {Math.abs(charged - dueAmt) < 0.005 ? <Pill tone="ok">match</Pill> : <Pill tone="wait">{charged > dueAmt ? "+" : "−"}{money(Math.abs(charged - dueAmt))}</Pill>}</> : "—"}</td>
                      <td className="td">{r.jcref ? <Pill tone="ok">{r.jcref}</Pill> : paid ? <Pill tone="bad">not posted</Pill> : <Pill>not paid</Pill>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
        {cur && <PayPanel key={cur.rid} r={cur} onClose={() => setSel(null)} />}
      </div>
    </>
  );
}

function PayPanel({ r, onClose }: { r: Row; onClose: () => void }) {
  const { busy, run } = useAction();
  const [start] = useState(() => ({ arb: r.arb || "", pdate: r.pdate || "", pm: r.pm || "", card: r.card || "", pref: r.pref || "", pby: r.pby || "", pip: !!r.pip, pwho: r.pwho || "", carb: r.carb ? String(r.carb) : "", cpat: r.cpat ? String(r.cpat) : "", notes: r.notes || "" }));
  const [v, setV] = useState(start);
  const [rcpt, setRcpt] = useState<File | null>(null);
  /* Only what was changed goes to Quickbase. "Paid by" is filled with the
     signed-in name only once a payment is being recorded. */
  const changed = () => {
    const out: Record<string, string | boolean> = {};
    (Object.keys(v) as (keyof typeof v)[]).forEach((k) => { if (v[k] !== start[k]) out[k] = v[k]; });
    const paying = Number(v.arb) > 0 && !start.arb;
    if (paying && !v.pby && PC().user?.name) out.pby = PC().user.name;
    return out;
  };
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setV((x) => ({ ...x, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value }));
  const charged = (Number(v.carb) || 0) + (Number(v.cpat) || 0), due = (r.adue || 0) + (r.pdue || 0);

  return (
    <aside className="card sticky top-[140px] flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <div><h2 className="m-0 text-base font-bold">{r.cs} · {r.sc}</h2><div className="text-xs text-mute">{r.muni} · {money(r.amt)} × {r.rate}%{r.prate ? ` + ${r.prate}%` : ""} = {money(due)}</div></div>
        <Btn kind="outline" aria-label="Close panel" className="w-10 px-0" onClick={onClose}><X className="h-4 w-4" /></Btn>
      </div>
      <div className="kpi-label">Payment</div>
      <div className="grid grid-cols-2 gap-2.5">
        <label className="label">Amount paid<input className="input" inputMode="decimal" value={v.arb} placeholder={due.toFixed(2)} onChange={set("arb")} /></label>
        <label className="label">Payment date<input type="date" className="input" value={v.pdate} onChange={set("pdate")} /></label>
        <label className="label">How paid<select className="input" value={v.pm} onChange={set("pm")}>{PMETH.map((m) => <option key={m} value={m}>{m || "how paid…"}</option>)}</select></label>
        {v.pm === "Credit Card"
          ? <label className="label">Which card<select className="input" value={v.card} onChange={set("card")}>{CARDS.map((m) => <option key={m} value={m}>{m || "which card…"}</option>)}</select></label>
          : <span />}
        <label className="label">Check no. / last 4 / conf.<input className="input" value={v.pref} onChange={set("pref")} /></label>
        <label className="label">Paid by<input className="input" value={v.pby} onChange={set("pby")} /></label>
        <label className="flex items-center gap-2 text-xs text-mute"><input type="checkbox" checked={v.pip} onChange={set("pip")} />Went in person</label>
        <label className="label">Who went<input className="input" value={v.pwho} onChange={set("pwho")} /></label>
      </div>
      <div className="kpi-label">What the town charged</div>
      <div className="grid grid-cols-2 gap-2.5">
        <label className="label">Arbitrio<input className="input" inputMode="decimal" value={v.carb} onChange={set("carb")} /></label>
        <label className="label">Patente<input className="input" inputMode="decimal" value={v.cpat} onChange={set("cpat")} /></label>
      </div>
      {charged > 0 && (Math.abs(charged - due) < 0.005 ? <Pill tone="ok">Matches our figure</Pill> : <Pill tone="wait">We expected {money(due)}</Pill>)}
      <div className="kpi-label">Receipt and job cost</div>
      <div className="text-[13px]">
        Receipt: {r.rcpt ? <button className="font-semibold text-navy underline" onClick={() => view(rowFile(r, 38), `Receipt - ${r.cs}`)}>{fname(r.rcpt)}</button> : <span className="text-mute">none on file</span>}
        <input type="file" accept=".pdf,image/*" className="mt-1 block text-xs" onChange={(e) => setRcpt(e.target.files?.[0] ?? null)} />
      </div>
      <div className="text-[13px]">{r.jcref ? <>Job cost posted as <b>{r.jcref}</b>, coded to Permits/blueprints/surveys-PR.</> : "Job cost posts itself once the amount, how it was paid and the payment date are in."}</div>
      <label className="label">Notes<input className="input" value={v.notes} onChange={set("notes")} /></label>
      {r.calc && <details className="text-xs"><summary className="cursor-pointer font-semibold text-navy">How this was worked out</summary><pre className="mt-1.5 whitespace-pre-wrap rounded-md border border-line bg-[#f8fafc] p-2 text-[11px]">{r.calc}</pre></details>}
      <div className="flex gap-2">
        <Btn kind="go" busy={busy === "s"} onClick={() => run("s", () => PC().savePayment(r.rid, changed(), rcpt).then((sid: string | null) => { setRcpt(null); return sid; }),
          (sid: string | null) => sid ? `Saved. Job cost posted as ${sid}.` : "Saved.")}>Save</Btn>
        {r.pdate && <span className="self-center text-xs text-mute">Paid {us(r.pdate)}</span>}
      </div>
    </aside>
  );
}
