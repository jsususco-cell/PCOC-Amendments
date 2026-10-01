import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Eye, Mail, Printer } from "lucide-react";
import { ActionBar, Btn, DateField, DocRow, EDGE, Empty, FileBtn, HeldBanner, Kpi, NextBox, PageTitle, Pill, TextField, useAction } from "@/components/ui";
import CaseHead from "@/components/CaseHead";
import MailNote, { mailToast } from "@/components/MailNote";
import { type Case, type Row, PC, caseFile, daysOf, have, inStep, limitOf, mailLive, missing, money, overdue, rowFile, rowsOf, us, useEngine, view } from "@/lib/engine";
import { cn, downloadBytes } from "@/lib/utils";

const due = (r: Row) => (r.adue || 0) + (r.pdue || 0);
const papers = (c: Case) => { const h = have(c); return { N: h.npa, R: h.rcpt, E: h.est, F: h.fal, T: h.to }; };
const ready = (c: Case) => { const p = papers(c); return p.N && p.R && p.E && p.F; };
const LEGEND: [string, string][] = [["N", "Permit Amendment Notice"], ["R", "Receipt from the first tax payment"], ["E", "Cost Estimate"], ["F", "Final Acceptance Letter"], ["T", "PRDOH task order (if we have it)"]];

export default function PayTown() {
  useEngine();
  const queue = inStep("C");
  const [sp, setSp] = useSearchParams();
  const towns = useMemo(() => {
    const m: Record<string, Case[]> = {};
    queue.forEach((c) => { const k = c.muni || "Municipality not set"; (m[k] = m[k] || []).push(c); });
    return Object.entries(m).map(([muni, L]) => ({
      muni, L, amt: L.reduce((t, c) => t + rowsOf(c).reduce((s, r) => s + due(r), 0), 0), ready: L.filter(ready).length,
    })).sort((a, b) => b.L.length - a.L.length || b.amt - a.amt);
  }, [queue]);
  const town = towns.find((t) => t.muni === sp.get("town")) ?? towns[0];
  const open = sp.get("case");
  const total = towns.reduce((t, x) => t + x.amt, 0);
  const missingN = queue.filter((c) => !ready(c)).length;
  const { busy, run } = useAction();

  const setTown = (m: string) => setSp((p) => { p.set("town", m); p.delete("case"); return p; }, { replace: true });
  const setCase = (cs: string | null) => setSp((p) => { if (cs) p.set("case", cs); else p.delete("case"); return p; }, { replace: true });

  const printPack = () => town && run("pack", async () => {
    const list = town.L.map((c) => rowsOf(c)[0]).filter(Boolean);
    const res = await PC().tripPack(list);
    downloadBytes(res.bytes, `Paquete Municipio - ${town.muni} - ${new Date().toISOString().slice(0, 10)}.pdf`);
    return res;
  }, (r: { missed: string[] }) => r.missed.length ? `Pack downloaded. Not in it: ${r.missed.join(", ")}.` : "Pack downloaded. Print the one file.");

  return (
    <>
      <PageTitle title="3 · Pay the town" who="Priscilla" ends="a trip is logged as Paid. Cases are grouped by town, so one trip pays them all." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Ready to pay" value={queue.length} sub={`cases in this step · limit ${limitOf("C")} days`} edge={EDGE.navy} />
        <Kpi label="To pay" value={money(total)} sub="arbitrios + patentes, our figure" edge={EDGE.navy} />
        <Kpi label="Towns" value={towns.length} sub="one trip each" edge={EDGE.amber} />
        <Kpi label="Papers missing" value={missingN} sub="cases not ready to take" edge={EDGE.red} />
      </div>
      {!mailLive() && <HeldBanner />}

      {towns.length === 0 ? <section className="card"><Empty>No case is waiting to be paid.</Empty></section> : (
        <>
          <div>
            <div className="kpi-label mb-2">Pick a town</div>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-6">
              {towns.map((t) => (
                <button key={t.muni} onClick={() => setTown(t.muni)}
                  className={cn("flex min-h-[44px] flex-col gap-0.5 rounded-[10px] border bg-white px-3 py-2.5 text-left",
                    town?.muni === t.muni ? "border-navy bg-[#f3f6fb] shadow-[inset_0_0_0_1px_#1F3864]" : "border-line hover:border-navy")}>
                  <span className="text-[13px] font-bold">{t.muni}</span>
                  <span className="text-lg font-bold tnum">{t.L.length}</span>
                  <span className="text-xs text-mute">{money(t.amt)} · {t.ready} ready</span>
                </button>
              ))}
            </div>
          </div>

          {town && (
            <section className="card overflow-x-auto">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
                <div>
                  <h2 className="m-0 text-lg font-bold">{town.muni} · route sheet</h2>
                  <p className="mt-0.5 text-xs text-mute">{town.L.length} case{town.L.length === 1 ? "" : "s"} · <b className="text-ink">{money(town.amt)} to pay</b> · {town.ready} of {town.L.length} ready to take</p>
                </div>
                <div className="flex gap-2">
                  <Btn kind="outline" busy={busy === "pack"} onClick={printPack}><Printer className="h-4 w-4" />Print one pack for this trip</Btn>
                  <Link className="btn border-navy bg-navy text-white no-underline hover:bg-navy-light hover:text-white" to={`/trips?town=${encodeURIComponent(town.muni)}`}>Log this trip</Link>
                </div>
              </div>
              <table className="w-full border-collapse">
                <thead><tr><th className="th">Case</th><th className="th text-right">Added scope</th><th className="th text-right">Arbitrio</th><th className="th text-right">Patente</th><th className="th">Papers to take</th><th className="th">Ready</th><th className="th"></th></tr></thead>
                <tbody>
                  {town.L.map((c) => {
                    const R = rowsOf(c), p = papers(c);
                    const miss = LEGEND.filter(([k]) => k !== "T" && !p[k as keyof typeof p]).map(([, n]) => n);
                    return (
                      <tr key={c.rid} className={cn(open === c.cs && "bg-[#f3f6fb]")}>
                        <td className="td"><b>{c.cs}</b><div className="text-xs text-mute">{c.pcoc ? `New permit ${c.pcoc} · ` : ""}<span className={cn(overdue(c) && "font-semibold text-bad-ink")}>{daysOf(c)} days</span></div></td>
                        <td className="td text-right">{money(R.reduce((t, r) => t + r.amt, 0))}</td>
                        <td className="td text-right">{money(R.reduce((t, r) => t + (r.adue || 0), 0))}</td>
                        <td className="td text-right">{money(R.reduce((t, r) => t + (r.pdue || 0), 0))}</td>
                        <td className="td whitespace-nowrap">{LEGEND.map(([k, n]) => {
                          const ok = p[k as keyof typeof p];
                          return <span key={k} title={`${n}: ${ok ? "in hand" : "missing"}`} className={cn("mr-1 inline-flex h-6 w-6 items-center justify-center rounded-md text-[10.5px] font-bold",
                            ok ? "bg-ok-bg text-ok-ink" : k === "T" ? "bg-[#eef1f6] text-mute" : "bg-bad-bg text-bad-ink")}>{k}</span>;
                        })}</td>
                        <td className="td">{ready(c) ? <Pill tone="ok">Ready</Pill> : <Pill tone="bad">{miss[0]?.split(" ").slice(0, 3).join(" ")} missing</Pill>}</td>
                        <td className="td"><Btn kind="outline" onClick={() => setCase(open === c.cs ? null : c.cs)}>{open === c.cs ? "Close" : "Open"}</Btn></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="flex flex-wrap gap-4 px-5 py-3 text-xs text-mute">
                {LEGEND.map(([k, n]) => <span key={k}><b className="text-ink">{k}</b> {n}</span>)}
                <span>Each case also carries our letter to the town and the calculation sheet.</span>
              </div>
            </section>
          )}
          {open && town?.L.find((c) => c.cs === open) && <PayCase key={open} c={town.L.find((x) => x.cs === open)!} />}
        </>
      )}
    </>
  );
}

function PayCase({ c }: { c: Case }) {
  const { busy, run } = useAction();
  const h = have(c);
  const R = rowsOf(c);
  const r3 = R.find((r) => r.d3 || r.l3), r4 = R.find((r) => r.d4 || r.l4), r0 = R[0];
  const [tlink, setTlink] = useState("");
  const [paid, setPaid] = useState(c.paid);
  const [falReq, setFalReq] = useState(c.falReq);
  const [pcoc, setPcoc] = useState(c.pcoc);
  const m = missing(c);
  const saveCase = (o: object, ok = "Saved.") => run("save", () => PC().saveCase(c.rid, o), (r: { stage: string }) => r?.stage && r.stage !== c.stage ? `${ok} ${c.cs} moved to ${r.stage}.` : ok);
  const saveRows = (o: object, ok: string) => run("rows", () => PC().saveRowDocs(c.rid, o), ok);
  const open = (r: Row | undefined, fid: number, lk: string, title: string) => r && ((r as unknown as Record<string, string>)[lk] ? window.open((r as unknown as Record<string, string>)[lk], "_blank") : view(rowFile(r, fid), `${title} - ${c.cs}`));

  return (
    <section className="card">
      <CaseHead c={c} />
      {m[0] && <div className="mx-5 mb-3.5"><NextBox>{m[0]}</NextBox></div>}
      <DocRow state={h.npa ? "ok" : "no"} name="Permit Amendment Notice" detail="From the PA (Step 2)" pill={h.npa ? <Pill tone="ok">In hand</Pill> : <Pill tone="bad">Missing</Pill>}>
        {h.npa && <Btn kind="outline" onClick={() => open(R.find((r) => r.d1 || r.l1), 46, "l1", "Permit Amendment Notice")}><Eye className="h-4 w-4" />View</Btn>}
      </DocRow>
      <DocRow state={h.rcpt ? "ok" : "no"} name="Receipt from the first tax payment" detail="The arbitrio receipt from when the permit was issued" pill={h.rcpt ? <Pill tone="ok">In hand</Pill> : <Pill tone="bad">Missing</Pill>}>
        {r3 && <Btn kind="outline" onClick={() => open(r3, 48, "l3", "Original arbitrio receipt")}><Eye className="h-4 w-4" />View</Btn>}
        <FileBtn label={h.rcpt ? "Replace" : "Upload"} accept=".pdf,image/*" busy={busy === "rows"} onFile={(f) => saveRows({ d3: f }, "Receipt saved on the case.")} />
      </DocRow>
      <DocRow state={h.est ? "ok" : "no"} name="Cost Estimate" detail="Made in Step 1" pill={h.est ? <Pill tone="ok">In hand</Pill> : <Pill tone="bad">Missing</Pill>}>
        {h.est && <Btn kind="outline" onClick={() => open(R.find((r) => r.d2 || r.l2), 47, "l2", "Cost Estimate")}><Eye className="h-4 w-4" />View</Btn>}
      </DocRow>
      <DocRow state={h.fal ? "ok" : c.falReq ? "wait" : "no"} name="Final Acceptance Letter"
        detail={<>{c.fal || (c.falReq ? `Asked ${us(c.falReq)}` : "Not asked yet")}<MailNote c={c} kind="fal" /></>}
        pill={h.fal ? <Pill tone="ok">In hand</Pill> : <Pill tone="bad">Missing</Pill>}>
        {c.fal && <Btn kind="outline" onClick={() => view(caseFile(c, 24), `Final Acceptance Letter - ${c.cs}`)}><Eye className="h-4 w-4" />View</Btn>}
        {!h.fal && <Btn kind="outline" busy={busy === "mfal"} onClick={() => run("mfal", () => PC().mail(c.rid, "fal"), mailToast)}><Mail className="h-4 w-4" />Ask for it</Btn>}
        <FileBtn label={h.fal ? "Replace" : "Upload"} accept=".pdf,image/*" busy={busy === "save"} onFile={(f) => saveCase({ files: { fal: f } }, "Final Acceptance Letter saved.")} />
      </DocRow>
      <DocRow state={h.to ? "ok" : "wait"} name="PRDOH task order (extra, if we have it)" detail={r4 ? (r4.tokind || "Notice of Issued Task Order") : "Optional"} pill={h.to ? <Pill tone="ok">In hand</Pill> : <Pill>Optional</Pill>}>
        {r4 && <Btn kind="outline" onClick={() => open(r4, 68, "l4", "PRDOH task order")}><Eye className="h-4 w-4" />View</Btn>}
        <FileBtn label="Upload" accept=".pdf,image/*" busy={busy === "rows"} onFile={(f) => saveRows({ d4: f }, "Task order saved on the case.")} />
        <input className="input w-44" placeholder="or paste Drive link" value={tlink} onChange={(e) => setTlink(e.target.value)} />
        {tlink && <Btn kind="outline" busy={busy === "rows"} onClick={() => saveRows({ l4: tlink.trim() }, "Task order link saved.")}>Save link</Btn>}
      </DocRow>
      <DocRow state={r0?.letter && r0?.sheet ? "ok" : "wait"} name="Our letter to the town and the calculation sheet" detail="Built by themselves on sync, rebuilt when a paper arrives"
        pill={r0?.pack ? <Pill tone="ok">Pack built {us(r0.packOn)}</Pill> : <Pill tone="wait">No pack yet</Pill>}>
        {r0?.letter && <Btn kind="outline" onClick={() => view(rowFile(r0, 61), `Carta al Municipio - ${c.cs}`)}>Letter</Btn>}
        {r0?.sheet && <Btn kind="outline" onClick={() => view(rowFile(r0, 66), `Calculo de Arbitrios - ${c.cs}`)}>Calculation</Btn>}
        {r0?.pack && <Btn kind="outline" onClick={() => view(rowFile(r0, 71), `Paquete Municipio - ${c.cs}`)}><Printer className="h-4 w-4" />Pack</Btn>}
      </DocRow>
      <div className="grid grid-cols-1 gap-3 border-t border-[#eef1f6] px-5 py-3.5 md:grid-cols-3">
        <DateField label="Asked for the Final Acceptance Letter on" value={falReq} onChange={setFalReq} />
        <DateField label="Taxes paid on (a Paid trip fills this in)" value={paid} onChange={setPaid} />
        <TextField label="New permit number (PCOC)" value={pcoc} onChange={setPcoc} placeholder="2025-123456-PCOC-123456" />
      </div>
      <ActionBar note={<>When paid, this case moves to <b>4 · Proof to the PA</b>. Log the trip so the payment and the Canopy note are recorded.</>}>
        <Btn kind="go" busy={busy === "save"} onClick={() => saveCase({ dates: { paid, falReq }, texts: { pcoc } })}>Save</Btn>
        <Link className="btn border-navy bg-navy text-white no-underline hover:text-white" to={`/trips?town=${encodeURIComponent(c.muni)}&case=${encodeURIComponent(c.cs)}`}>Log a trip for this case</Link>
      </ActionBar>
    </section>
  );
}
