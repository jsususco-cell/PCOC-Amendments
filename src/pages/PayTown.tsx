import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Eye, Mail, Printer } from "lucide-react";
import { ActionBar, Btn, DateField, DocRow, EDGE, Empty, FileBtn, HeldBanner, Kpi, NextBox, PageTitle, Pill, TextField, useAction } from "@/components/ui";
import CaseHead from "@/components/CaseHead";
import { FromBanner } from "@/components/CaseLookup";
import MailNote, { mailToast } from "@/components/MailNote";
import { type Case, type Row, PC, caseAmt, caseArb, caseFile, casePat, cases, fname, daysOf, have, inStep, isRefund, limitOf, mailLive, missing, money, overdue, rowFile, rowsOf, us, useEngine, view } from "@/lib/engine";
import { cn, downloadBytes } from "@/lib/utils";

const due = (r: Row) => (r.adue || 0) + (r.pdue || 0);
/* The town asks for exactly these four (Priscilla, 2026-10-06). */
const papers = (c: Case) => {
  const h = have(c);
  return { N: h.npa, F: h.fal, R: h.rcpt, C: rowsOf(c).some((r) => !!r.sheet) };
};
const ready = (c: Case) => { const p = papers(c); return p.N && p.F && p.R && p.C; };
const LEGEND: [string, string][] = [["N", "Permit Amendment Notification"], ["F", "Final Acceptance Letter"], ["R", "Receipt of the original taxes paid"], ["C", "Our calculation sheet"]];

export default function PayTown() {
  useEngine();
  const queue = inStep("C");
  const [sp, setSp] = useSearchParams();
  const towns = useMemo(() => {
    const m: Record<string, Case[]> = {};
    queue.forEach((c) => { const k = c.muni || "Municipality not set"; (m[k] = m[k] || []).push(c); });
    return Object.entries(m).map(([muni, L]) => ({
      muni, L, amt: L.filter((c) => !isRefund(c)).reduce((t, c) => t + caseArb(c) + casePat(c), 0),
      back: L.filter(isRefund).reduce((t, c) => t + Math.abs(caseArb(c) + casePat(c)), 0), ready: L.filter(ready).length,
    })).sort((a, b) => b.L.length - a.L.length || b.amt - a.amt);
  }, [queue]);
  const town = towns.find((t) => t.muni === sp.get("town")) ?? towns[0];
  const open = sp.get("case");
  const total = towns.reduce((t, x) => t + x.amt, 0);
  const totalBack = towns.reduce((t, x) => t + x.back, 0);
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
      <PageTitle title="3 · Pay the town" who="Priscilla" ends="the taxes are paid at the town (in person), or the refund is claimed when the cost went down. Cases are grouped by town, so one trip does them all." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Ready to pay" value={queue.length} sub={`cases in this step · limit ${limitOf("C")} days`} edge={EDGE.navy} />
        <Kpi label="To pay" value={money(total)} sub={totalBack ? `arbitrios + patentes · ${money(totalBack)} to claim back` : "arbitrios + patentes, our figure"} edge={EDGE.navy} />
        <Kpi label="Towns" value={towns.length} sub="one trip each" edge={EDGE.amber} />
        <Kpi label="Papers missing" value={missingN} sub="cases not ready to take" edge={EDGE.red} />
      </div>
      {!mailLive() && <HeldBanner />}

      <section className="card flex flex-wrap items-center gap-3 px-5 py-3.5">
        <label htmlFor="from-b" className="text-sm font-semibold">Bring in a case from 2 · With the PA</label>
        <select id="from-b" className="input min-w-[18rem]" value="" disabled={!inStep("B").length}
          onChange={(e) => e.target.value && setCase(e.target.value)}>
          <option value="">{inStep("B").length ? `From 2 · With the PA (${inStep("B").length})…` : "Nothing in 2 · With the PA"}</option>
          {inStep("B").map((c) => <option key={c.rid} value={c.cs}>{c.cs} · {c.muni || "—"} · {daysOf(c)} d</option>)}
        </select>
        <span className="text-xs text-mute">The case opens below. It moves here by itself once its Notice is in.</span>
      </section>
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
                  <span className="text-xs text-mute">{money(t.amt)}{t.back ? ` · ${money(t.back)} back` : ""} · {t.ready} ready</span>
                </button>
              ))}
            </div>
          </div>

          {town && (
            <section className="card overflow-x-auto">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
                <div>
                  <h2 className="m-0 text-lg font-bold">{town.muni} · route sheet</h2>
                  <p className="mt-0.5 text-xs text-mute">{town.L.length} case{town.L.length === 1 ? "" : "s"} · <b className="text-ink">{money(town.amt)} to pay</b>{town.back ? <> · <b className="text-bad-ink">{money(town.back)} to claim back</b></> : null} · {town.ready} of {town.L.length} ready to take</p>
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
                    const miss = LEGEND.filter(([k]) => !p[k as keyof typeof p]).map(([, n]) => n);
                    return (
                      <tr key={c.rid} className={cn(open === c.cs && "bg-[#f3f6fb]")}>
                        <td className="td"><b>{c.cs}</b>{isRefund(c) && <> <Pill tone="bad">Refund</Pill></>}<div className="text-xs text-mute">{c.pcoc ? `New permit ${c.pcoc} · ` : ""}<span className={cn(overdue(c) && "font-semibold text-bad-ink")}>{daysOf(c)} days</span></div></td>
                        <td className="td text-right">{money(caseAmt(c))}</td>
                        <td className={cn("td text-right", isRefund(c) && "text-bad-ink")}>{money(Math.abs(caseArb(c)))}{isRefund(c) ? " back" : ""}</td>
                        <td className={cn("td text-right", isRefund(c) && "text-bad-ink")}>{money(Math.abs(casePat(c)))}{isRefund(c) ? " back" : ""}</td>
                        <td className="td whitespace-nowrap">{LEGEND.map(([k, n]) => {
                          const ok = p[k as keyof typeof p];
                          return <span key={k} title={`${n}: ${ok ? "in hand" : "missing"}`} className={cn("mr-1 inline-flex h-6 w-6 items-center justify-center rounded-md text-[10.5px] font-bold",
                            ok ? "bg-ok-bg text-ok-ink" : "bg-bad-bg text-bad-ink")}>{k}</span>;
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
                <span>The town gets these four and nothing else. For a refund claim, bring the same four.</span>
              </div>
            </section>
          )}
          {open && town?.L.find((c) => c.cs === open) && <PayCase key={open} c={town.L.find((x) => x.cs === open)!} />}
        </>
      )}
      {open && !queue.some((c) => c.cs === open) && cases().find((c) => c.cs === open) && <PayCase key={open} c={cases().find((c) => c.cs === open)!} />}
    </>
  );
}

function PayCase({ c }: { c: Case }) {
  const { busy, run } = useAction();
  const h = have(c);
  const p = papers(c);
  const R = rowsOf(c);
  const r1 = R.find((r) => r.d1 || r.l1), r3 = R.find((r) => r.d3 || r.l3), r0 = R[0];
  const rs = R.find((r) => r.sheet);
  const [paid, setPaid] = useState(c.paid);
  const refund = isRefund(c);
  const [falReq, setFalReq] = useState(c.falReq);
  const [pcoc, setPcoc] = useState(c.pcoc);
  const m = missing(c);
  const saveCase = (o: object, ok = "Saved.") => run("save", () => PC().saveCase(c.rid, o), (r: { stage: string; from: string }) => r?.stage && r.from && r.stage !== r.from ? `${ok} ${c.cs} moved to ${r.stage}.` : ok);
  const saveRows = (o: object, ok: string) => run("rows", () => PC().saveRowDocs(c.rid, o), ok);
  const open = (r: Row | undefined, fid: number, lk: string, title: string) => r && ((r as unknown as Record<string, string>)[lk] ? window.open((r as unknown as Record<string, string>)[lk], "_blank") : view(rowFile(r, fid), `${title} - ${c.cs}`));

  return (
    <section className="card">
      <CaseHead c={c} right={<p className="mt-1.5 text-sm"><b>{Object.values(p).filter(Boolean).length}</b> <span className="text-xs text-mute">of 4 papers for the town</span></p>} />
      <FromBanner c={c} stepKey="C"><span className="text-xs text-mute">You can gather its papers now. It moves to this step by itself when its Permit Amendment Notification is in.</span></FromBanner>
      {m[0] && <div className="mx-5 mb-3.5"><NextBox>{m[0]}</NextBox></div>}
      <div className="mx-5 mb-1 text-xs text-mute">The town gets these four, and only these four.</div>

      <DocRow state={h.npa ? "ok" : "no"} name="1. Permit Amendment Notification" detail="From the PA (Step 2). It has the new permit number."
        pill={h.npa ? <Pill tone="ok">In hand</Pill> : <Pill tone="bad">Missing</Pill>}>
        {r1 && <Btn kind="outline" onClick={() => open(r1, 46, "l1", "Permit Amendment Notification")}><Eye className="h-4 w-4" />View</Btn>}
      </DocRow>
      <DocRow state={h.fal ? "ok" : c.falReq ? "wait" : "no"} name="2. Final Acceptance Letter"
        detail={<>{c.fal || (c.falReq ? `Asked the PMs ${us(c.falReq)}` : "Ask the PMs by email. They send it back.")}<MailNote c={c} kind="fal" /></>}
        pill={h.fal ? <Pill tone="ok">In hand</Pill> : c.falReq ? <Pill tone="wait">Asked</Pill> : <Pill tone="bad">Missing</Pill>}>
        {c.fal && <Btn kind="outline" onClick={() => view(caseFile(c, 24), `Final Acceptance Letter - ${c.cs}`)}><Eye className="h-4 w-4" />View</Btn>}
        {!h.fal && <Btn kind="outline" busy={busy === "mfal"} onClick={() => run("mfal", () => PC().mail(c.rid, "fal"), mailToast)}><Mail className="h-4 w-4" />{c.falReq ? "Ask the PMs again" : "Ask the PMs"}</Btn>}
        <FileBtn label={h.fal ? "Replace" : "Upload"} accept=".pdf,image/*" busy={busy === "save"} onFile={(f) => saveCase({ files: { fal: f } }, "Final Acceptance Letter saved.")} />
      </DocRow>
      <DocRow state={h.rcpt ? "ok" : "no"} name="3. Receipt of the original taxes paid" detail="The arbitrio receipt from before construction started"
        pill={h.rcpt ? <Pill tone="ok">In hand</Pill> : <Pill tone="bad">Missing</Pill>}>
        {r3 && <Btn kind="outline" onClick={() => open(r3, 48, "l3", "Original arbitrio receipt")}><Eye className="h-4 w-4" />View</Btn>}
        <FileBtn label={h.rcpt ? "Replace" : "Upload"} accept=".pdf,image/*" busy={busy === "rows"} onFile={(f) => saveRows({ d3: f }, "Receipt saved on the case.")} />
      </DocRow>
      <DocRow state={rs ? "ok" : "no"} name="4. Our calculation sheet" detail={rs ? `${fname(rs.sheet)}${rs.sheetOn ? " · built " + us(rs.sheetOn) : ""}` : "Case summary and what is subject to patente and taxes. Built from the latest scope change."}
        pill={rs ? <Pill tone="ok">Built</Pill> : <Pill tone="bad">Not built</Pill>}>
        {rs && <Btn kind="outline" onClick={() => view(rowFile(rs, 66), `Calculo de Arbitrios - ${c.cs}`)}><Eye className="h-4 w-4" />View</Btn>}
        <Btn kind={rs ? "outline" : "primary"} busy={busy === "sheet"} onClick={() => run("sheet", () => PC().buildSheet(c.rid), "Calculation sheet built.")}>{rs ? "Rebuild" : "Build it"}</Btn>
      </DocRow>

      <div className="flex flex-wrap items-center gap-2 border-t border-[#eef1f6] px-5 py-3.5">
        <Btn kind="outline" busy={busy === "pack"} onClick={() => run("pack", () => PC().buildPack(c.rid).then(() => view(rowFile(rowsOf(c)[0], 71), `Paquete Municipio - ${c.cs}`)))}>
          <Printer className="h-4 w-4" />{r0?.pack ? "Rebuild and open the print pack" : "Build and open the print pack"}
        </Btn>
        <span className="text-xs text-mute">One PDF with the four papers, to print for the trip.{r0?.pack && r0?.packOn ? ` Last built ${us(r0.packOn)}.` : ""}</span>
        {r0?.letter && <button className="ml-auto text-xs font-semibold text-navy underline" onClick={() => view(rowFile(r0, 61), `Carta al Municipio - ${c.cs}`)}>Our cover letter to the town (extra)</button>}
      </div>

      <div className="grid grid-cols-1 gap-3 border-t border-[#eef1f6] px-5 py-3.5 md:grid-cols-3">
        <DateField label={refund ? "Refund claimed on" : "Taxes paid on"} value={paid} onChange={setPaid} />
        <DateField label="Asked the PMs for the letter on" value={falReq} onChange={setFalReq} />
        <TextField label="New permit number (PCOC)" value={pcoc} onChange={setPcoc} placeholder="2025-123456-PCOC-123456" />
      </div>
      <ActionBar note={refund
        ? <>The cost went down: <b>claim the refund</b> at the town with the same four papers. With the claim date in, this case moves to <b>4 · Proof to the PA</b>. Log the trip as "Refund claim".</>
        : <>With the paid date in, this case moves to <b>4 · Proof to the PA</b>. Put what the town actually charged in Payments, or log the trip.</>}>
        <Btn kind="go" busy={busy === "save"} onClick={() => saveCase({ dates: { paid, falReq }, texts: { pcoc } })}>Save</Btn>
        <Link className="btn border-[#cfd6e2] bg-white text-navy no-underline hover:border-navy" to={`/trips?town=${encodeURIComponent(c.muni)}&case=${encodeURIComponent(c.cs)}`}>Log the trip (optional)</Link>
      </ActionBar>
    </section>
  );
}
