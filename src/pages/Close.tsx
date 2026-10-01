import { useState } from "react";
import { Btn, EDGE, Empty, Kpi, PageTitle, Pill, useAction } from "@/components/ui";
import { type Case, PC, cases, daysOf, inStep, limitOf, us, useEngine } from "@/lib/engine";

export default function Close() {
  useEngine();
  const queue = inStep("E");
  const closed = cases().filter((c) => c.stage === "Closed");
  const month = new Date().toISOString().slice(0, 7);
  const noCanopy = queue.filter((c) => !c.cnApp).length;

  return (
    <>
      <PageTitle title="5 · Close" who="the PA (we record it)" ends={'approved is marked in Canopy and "Amendment closed on" has a date.'} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Waiting to close" value={queue.length} sub={`limit ${limitOf("E")} days`} edge={EDGE.navy} />
        <Kpi label="Canopy not marked" value={noCanopy} sub="mark approved in Canopy" edge={EDGE.amber} />
        <Kpi label="Closed this month" value={closed.filter((c) => (c.closed || "").startsWith(month)).length} edge={EDGE.green} />
        <Kpi label="Closed in all" value={closed.length} sub={`${closed.filter((c) => !c.closed).length} without a close date`} edge={EDGE.green} />
      </div>
      <section className="card overflow-x-auto">
        <div className="border-b border-line px-4 py-3.5">
          <h2 className="m-0 text-base font-bold">Waiting for the PA to close</h2>
          <div className="text-xs text-mute">Type the two dates on the row and save.</div>
        </div>
        {queue.length === 0 ? <Empty>Nothing is waiting to close.</Empty> : (
          <table className="w-full border-collapse">
            <thead><tr><th className="th">Case</th><th className="th">Proof sent</th><th className="th text-right">Days</th><th className="th">Marked approved in Canopy</th><th className="th">Amendment closed on</th><th className="th"></th></tr></thead>
            <tbody>{queue.map((c) => <CloseRow key={c.rid} c={c} />)}</tbody>
          </table>
        )}
      </section>
    </>
  );
}

function CloseRow({ c }: { c: Case }) {
  const { busy, run } = useAction();
  const [cnApp, setCnApp] = useState(c.cnApp);
  const [closed, setClosed] = useState(c.closed);
  return (
    <tr>
      <td className="td"><b>{c.cs}</b><div className="text-xs text-mute">{c.muni}{c.pcoc ? ` · ${c.pcoc}` : ""}</div></td>
      <td className="td">{us(c.closeSent) || "—"}</td>
      <td className="td text-right"><Pill tone={daysOf(c) > limitOf("E") ? "bad" : "grey"}>{daysOf(c)}</Pill></td>
      <td className="td"><input type="date" className="input" aria-label={`Marked approved in Canopy, ${c.cs}`} value={cnApp || ""} onChange={(e) => setCnApp(e.target.value)} /></td>
      <td className="td"><input type="date" className="input" aria-label={`Amendment closed on, ${c.cs}`} value={closed || ""} onChange={(e) => setClosed(e.target.value)} /></td>
      <td className="td">
        <Btn kind="go" busy={busy === "s"} onClick={() => run("s", () => PC().saveCase(c.rid, { dates: { cnApp, closed } }),
          (r: { stage: string }) => r?.stage === "Closed" ? `${c.cs} is closed.` : "Saved.")}>Save</Btn>
      </td>
    </tr>
  );
}
