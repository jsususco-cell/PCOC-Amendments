import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Btn, Confirm, Empty, PageTitle, Pill, useAction } from "@/components/ui";
import { PC, cases, rows, us, useEngine } from "@/lib/engine";

interface Rate { rid: string | null; muni: string; rate: number | null; prate: number; on: string; note: string }

export default function Rates() {
  useEngine();
  const [list, setList] = useState<Rate[] | null>(null);
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");
  const load = () => PC().loadRates().then((r: Rate[]) => {
    const towns = new Set(rows().map((x) => x.muni).filter(Boolean));
    const have = new Set(r.map((x) => x.muni));
    const extra = [...towns].filter((t) => !have.has(t)).map((t) => ({ rid: null, muni: t, rate: null, prate: 0, on: "", note: "" }));
    setList([...r, ...extra].sort((a, b) => a.muni.localeCompare(b.muni)));
  }).catch((e: Error) => setErr(e.message));
  useEffect(() => { load(); }, []);
  const L = (list ?? []).filter((r) => !q || r.muni.toUpperCase().includes(q.toUpperCase()));

  return (
    <>
      <PageTitle title="Rates">
        <input className="input w-56" placeholder="Search town" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search town" />
      </PageTitle>
      <p className="-mt-3 text-[13px] text-mute">Arbitrio and patente rate for each town. Change a rate here once: every scope change in that town is recalculated.</p>
      <section className="card overflow-x-auto">
        {err ? <Empty>{err}</Empty> : !list ? <p className="flex items-center gap-2 px-4 py-6 text-sm text-mute"><Loader2 className="h-4 w-4 animate-spin" />Loading rates…</p> : L.length === 0 ? <Empty>No towns match.</Empty> : (
          <table className="w-full border-collapse">
            <thead><tr><th className="th">Town</th><th className="th text-right">Arbitrio %</th><th className="th text-right">Patente %</th><th className="th text-right">Open cases</th><th className="th">Last changed</th><th className="th">Note</th><th className="th"></th></tr></thead>
            <tbody>{L.map((r) => <RateRow key={r.muni} r={r} onSaved={load} />)}</tbody>
          </table>
        )}
      </section>
    </>
  );
}

function RateRow({ r, onSaved }: { r: Rate; onSaved: () => void }) {
  const [rate, setRate] = useState(r.rate == null ? "" : String(r.rate));
  const [prate, setPrate] = useState(String(r.prate ?? 0));
  const [ask, setAsk] = useState(false);
  const { busy, run } = useAction();
  const n = rows().filter((x) => x.muni === r.muni).length;
  const open = cases().filter((c) => c.muni === r.muni && c.stage !== "Closed" && c.stage !== "Not required").length;
  const dirty = rate !== (r.rate == null ? "" : String(r.rate)) || prate !== String(r.prate ?? 0);
  return (
    <tr>
      <td className="td"><b>{r.muni}</b></td>
      <td className="td text-right"><input className="input w-24 text-right" inputMode="decimal" aria-label={`${r.muni} arbitrio`} value={rate} placeholder="—" onChange={(e) => setRate(e.target.value)} /></td>
      <td className="td text-right"><input className="input w-24 text-right" inputMode="decimal" aria-label={`${r.muni} patente`} value={prate} onChange={(e) => setPrate(e.target.value)} /></td>
      <td className="td text-right">{open}</td>
      <td className="td">{r.on ? us(r.on) : r.rate == null ? <Pill tone="wait">no rate yet</Pill> : "—"}</td>
      <td className="td text-xs text-mute">{r.note}</td>
      <td className="td">
        <Btn kind="outline" disabled={!dirty || rate === ""} busy={busy === "s"} onClick={() => setAsk(true)}>Save</Btn>
        <Confirm open={ask} title={`Change the ${r.muni} rate?`} action="Change the rate"
          body={<>Arbitrio <b>{rate}%</b>, patente <b>{prate || 0}%</b>. This recalculates the amount due on all <b>{n}</b> scope change{n === 1 ? "" : "s"} in {r.muni}.</>}
          onCancel={() => setAsk(false)}
          onOk={() => { setAsk(false); run("s", () => PC().saveRate(r.muni, rate, prate).then((k: number) => { onSaved(); return k; }), (k: number) => `${r.muni} updated. ${k} scope change${k === 1 ? "" : "s"} recalculated.`); }} />
      </td>
    </tr>
  );
}
