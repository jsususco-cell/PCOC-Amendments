import { useState } from "react";
import { Send } from "lucide-react";
import { Btn, EDGE, Empty, Kpi, PageTitle, Pill, useAction } from "@/components/ui";
import MailNote, { mailToast } from "@/components/MailNote";
import { type Case, PC, cases, daysOf, inStep, lastMail, limitOf, us, useEngine } from "@/lib/engine";

const LESLIE_KEY = "pcoc.leslie";
const readLeslie = () => { try { return localStorage.getItem(LESLIE_KEY) || ""; } catch { return ""; } };

export default function Close() {
  useEngine();
  const queue = inStep("E");
  const closed = cases().filter((c) => c.stage === "Closed");
  const month = new Date().toISOString().slice(0, 7);
  const kind = PC().handoffKind as string;
  const toLeslie = closed.filter((c) => !lastMail(c, kind)).sort((a, b) => (b.closed || "").localeCompare(a.closed || ""));
  const [leslie, setLeslie] = useState(readLeslie);

  return (
    <>
      <PageTitle title="5 · PCOC issued" who="the PA (we record it), then Leslie" ends="the PA issues the PCOC (the final construction permit) and Leslie is told to start the use permit." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Waiting for the PCOC" value={queue.length} sub={`proof sent to the PA · limit ${limitOf("E")} days`} edge={EDGE.navy} />
        <Kpi label="Issued this month" value={closed.filter((c) => (c.closed || "").startsWith(month)).length} edge={EDGE.green} />
        <Kpi label="To hand to Leslie" value={toLeslie.filter((c) => c.closed).length} sub="PCOC issued, use permit not started" edge={EDGE.amber} />
        <Kpi label="Done in all" value={closed.length} sub={`${closed.filter((c) => !c.closed).length} older ones without a date`} edge={EDGE.green} />
      </div>

      <section className="card overflow-x-auto">
        <div className="border-b border-line px-4 py-3.5">
          <h2 className="m-0 text-base font-bold">Waiting for the PA to issue the PCOC</h2>
          <div className="text-xs text-mute">Put the date the PCOC was issued and save. Marking it in Canopy is optional.</div>
        </div>
        {queue.length === 0 ? <Empty>Nothing is waiting for the PCOC.</Empty> : (
          <table className="w-full border-collapse">
            <thead><tr><th className="th">Case</th><th className="th">Proof sent</th><th className="th text-right">Days</th><th className="th">PCOC issued on</th><th className="th">Marked in Canopy (optional)</th><th className="th"></th></tr></thead>
            <tbody>{queue.map((c) => <CloseRow key={c.rid} c={c} />)}</tbody>
          </table>
        )}
      </section>

      <section className="card overflow-x-auto">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line px-4 py-3.5">
          <div>
            <h2 className="m-0 text-base font-bold">Hand to Leslie for the use permit</h2>
            <div className="text-xs text-mute">The amendment is done. One email tells Leslie the case can start the use permit.</div>
          </div>
          <label className="label">Leslie's email
            <input className="input w-72" type="email" value={leslie} placeholder="name@byrdsonservices.com"
              onChange={(e) => { setLeslie(e.target.value); try { localStorage.setItem(LESLIE_KEY, e.target.value); } catch { /* not kept */ } }} />
          </label>
        </div>
        {toLeslie.filter((c) => c.closed).length === 0 ? <Empty>Every issued PCOC has been handed to Leslie.</Empty> : (
          <table className="w-full border-collapse">
            <thead><tr><th className="th">Case</th><th className="th">PCOC issued</th><th className="th">New permit number</th><th className="th"></th></tr></thead>
            <tbody>{toLeslie.filter((c) => c.closed).map((c) => <HandoffRow key={c.rid} c={c} to={leslie} />)}</tbody>
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
      <td className="td"><input type="date" className="input" aria-label={`PCOC issued on, ${c.cs}`} value={closed || ""} onChange={(e) => setClosed(e.target.value)} /></td>
      <td className="td"><input type="date" className="input" aria-label={`Marked in Canopy, ${c.cs}`} value={cnApp || ""} onChange={(e) => setCnApp(e.target.value)} /></td>
      <td className="td">
        <Btn kind="go" busy={busy === "s"} onClick={() => run("s", () => PC().saveCase(c.rid, { dates: { cnApp, closed } }),
          (r: { stage: string }) => r?.stage === "Closed" ? `${c.cs}: PCOC issued. Now hand it to Leslie below.` : "Saved.")}>Save</Btn>
      </td>
    </tr>
  );
}

function HandoffRow({ c, to }: { c: Case; to: string }) {
  const { busy, run } = useAction();
  return (
    <tr>
      <td className="td"><b>{c.cs}</b><div className="text-xs text-mute">{c.muni}</div></td>
      <td className="td">{us(c.closed)}</td>
      <td className="td">{c.pcoc || "—"}</td>
      <td className="td">
        <Btn busy={busy === "h"} disabled={!to} title={to ? "" : "Type Leslie's email above"} onClick={() => run("h", () => PC().handoff(c.rid, to), mailToast)}><Send className="h-4 w-4" />Tell Leslie</Btn>
        <MailNote c={c} kind={PC().handoffKind} />
      </td>
    </tr>
  );
}
