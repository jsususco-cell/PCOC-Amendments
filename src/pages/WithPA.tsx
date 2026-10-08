import { useState } from "react";
import { Upload } from "lucide-react";
import { ActionBar, Btn, DateField, EDGE, Empty, HeldBanner, Kpi, NextBox, PageTitle, Pill, TextField, useAction } from "@/components/ui";
import CaseLookup, { FromBanner } from "@/components/CaseLookup";
import CaseHead from "@/components/CaseHead";
import MailNote, { mailToast } from "@/components/MailNote";
import { type Case, PC, daysOf, fname, have, inStep, limitOf, mailLive, missing, rowFile, rowsOf, us, useEngine, view } from "@/lib/engine";
import { useSelectedCase } from "@/lib/useCase";

export default function WithPA() {
  useEngine();
  const queue = inStep("B");
  const [c, pick] = useSelectedCase(queue);
  const late = queue.filter((x) => daysOf(x) > limitOf("B")).length;
  
  return (
    <>
      <PageTitle title="2 · With the PA" who="the PA (Priscilla waits and reminds)" ends="the Permit Amendment Notice is in and the new permit number is typed." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Waiting on the PA" value={queue.length} sub={`limit ${limitOf("B")} days`} edge={EDGE.navy} />
        <Kpi label={`Past ${limitOf("B")} days`} value={late} sub="a reminder goes out by itself" edge={EDGE.red} />
        <Kpi label="Notice in, no number" value={queue.filter((x) => (x.npaOn && !x.pcoc)).length} sub="type the new permit number" edge={EDGE.amber} />
        <Kpi label="Notices in" value={inStep("C").length} sub="now in Pay the town" edge={EDGE.green} />
      </div>
      {!mailLive() && <HeldBanner />}

      <section className="card overflow-x-auto">
        <div className="border-b border-line px-4 py-3.5"><h2 className="m-0 text-base font-bold">Waiting on the PA</h2><div className="text-xs text-mute">Oldest first.</div></div>
        {queue.length === 0 ? <Empty>Nobody is waiting on the PA.</Empty> : (
          <table className="w-full border-collapse">
            <thead><tr><th className="th">Case</th><th className="th">Sent to the PA</th><th className="th text-right">Days waiting</th><th className="th">Marked in Canopy (optional)</th><th className="th">Last email</th><th className="th"></th></tr></thead>
            <tbody>
              {queue.map((x) => (
                <tr key={x.rid}>
                  <td className="td"><b>{x.cs}</b><div className="text-xs text-mute">{x.muni}</div></td>
                  <td className="td">{us(x.sentPA) || "—"}</td>
                  <td className="td text-right"><Pill tone={daysOf(x) > limitOf("B") ? "bad" : "grey"}>{daysOf(x)}</Pill></td>
                  <td className="td">{x.cnSub ? <Pill tone="ok">{us(x.cnSub)}{x.cnId ? ` · #${x.cnId}` : ""}</Pill> : <span className="text-xs text-mute">—</span>}</td>
                  <td className="td"><MailNote c={x} kind="chase" /><MailNote c={x} kind="pa" /></td>
                  <td className="td"><Btn kind="outline" onClick={() => pick(x.cs)}>Open</Btn></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <CaseLookup queue={queue} selected={c} onPick={pick} stepKey="B" from={{ label: "1 · Prepare", list: inStep("A") }} />
      {c && <WithPACase key={c.rid} c={c} />}
    </>
  );
}

function WithPACase({ c }: { c: Case }) {
  const { busy, run } = useAction();
  const [npa, setNpa] = useState<File | null>(null);
  const [f, setF] = useState({ pcoc: c.pcoc, cnId: c.cnId, npaOn: c.npaOn, cnSub: c.cnSub, sentPA: c.sentPA });
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const r1 = rowsOf(c).find((r) => r.d1 || r.l1);
  const m = missing(c);

  const save = () => run("save", () => PC().saveCase(c.rid, {
    npa: npa || undefined,
    texts: { pcoc: f.pcoc, cnId: f.cnId },
    dates: { npaOn: f.npaOn, cnSub: f.cnSub, sentPA: f.sentPA },
  }).then((r: { stage: string }) => { setNpa(null); return r; }),
  (r: { stage: string; from: string }) => r?.stage && r.from && r.stage !== r.from ? `Saved. ${c.cs} moved to ${r.stage}.` : "Saved.");

  return (
    <section className="card">
      <CaseHead c={c} />
      <FromBanner c={c} stepKey="B"><span className="text-xs text-mute">Put in "Sent to the PA on", or the Notice when it comes: the case moves on by itself when you save.</span></FromBanner>
      {m[0] && <div className="mx-5 mb-4"><NextBox>{m[0]}</NextBox></div>}
      <label className="mx-5 flex cursor-pointer flex-col items-center rounded-xl border-2 border-dashed border-[#cfd6e2] bg-[#fafbfd] px-6 py-6 text-center hover:border-navy">
        <Upload className="h-7 w-7 text-navy" />
        <span className="mt-1.5 text-sm font-semibold">{npa ? npa.name : have(c).npa ? "Replace the Permit Amendment Notice" : "Choose the Permit Amendment Notice"}</span>
        <span className="text-xs text-mute">PDF or photo. A notice saved in the case's Drive folder (05 Permits / Amendment) is picked up by itself.</span>
        <input type="file" accept=".pdf,image/*" className="hidden" onChange={(e) => setNpa(e.target.files?.[0] ?? null)} />
      </label>
      {r1 && (
        <p className="mx-5 mt-2 text-xs">On file: <button className="font-semibold text-navy underline" onClick={() => r1.l1 ? window.open(r1.l1, "_blank") : view(rowFile(r1, 46), `Permit Amendment Notice - ${c.cs}`)}>{fname(r1.d1) || "open (Drive)"}</button></p>
      )}
      <div className="grid grid-cols-1 gap-3 px-5 py-4 md:grid-cols-5">
        <TextField label="New permit number (PCOC)" value={f.pcoc} onChange={set("pcoc")} placeholder="2025-123456-PCOC-123456" />
        <DateField label="Got the notice on" value={f.npaOn} onChange={set("npaOn")} />
        <DateField label="Marked in Canopy (optional)" value={f.cnSub} onChange={set("cnSub")} />
        <TextField label="Canopy submittal no. (optional)" value={f.cnId} onChange={set("cnId")} />
        <DateField label="Sent to the PA on" value={f.sentPA} onChange={set("sentPA")} />
      </div>
      <ActionBar note={<>With the notice in, this case moves to <b>3 · Pay the town</b>.</>}>
        <Btn kind="go" busy={busy === "save"} onClick={save}>Save</Btn>
        <Btn kind="outline" busy={busy === "rem"} onClick={() => run("rem", () => PC().remindPA(c.rid), mailToast)}>Send the PA a reminder</Btn>
      </ActionBar>
    </section>
  );
}
