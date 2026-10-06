import { useState } from "react";
import { Eye, Send } from "lucide-react";
import { ActionBar, Btn, DateField, DocRow, EDGE, FileBtn, HeldBanner, Kpi, NextBox, PageTitle, Pill, useAction } from "@/components/ui";
import CaseLookup from "@/components/CaseLookup";
import CaseHead from "@/components/CaseHead";
import MailNote, { mailToast } from "@/components/MailNote";
import { type Case, PC, caseFile, fname, have, inStep, limitOf, mailLive, missing, rowFile, rowsOf, us, useEngine, view } from "@/lib/engine";
import { useSelectedCase } from "@/lib/useCase";

export default function Proof() {
  useEngine();
  const queue = inStep("D");
  const [c, pick] = useSelectedCase(queue);
  const noPhoto = queue.filter((x) => x.stkr && !x.sign).length;
  const noProof = queue.filter((x) => !x.cert && !rowsOf(x).some((r) => r.rcpt)).length;

  return (
    <>
      <PageTitle title="4 · Proof to the PA" who="Priscilla" ends="the PA gets the proof of payment and the photo of the job sign with the new permit number." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="In this step" value={queue.length} sub={`limit ${limitOf("D")} days`} edge={EDGE.navy} />
        <Kpi label="Waiting on the sign photo" value={noPhoto} sub="inspectors asked, no photo yet" edge={EDGE.amber} />
        <Kpi label="No proof of payment" value={noProof} sub="paid, but no receipt on file" edge={EDGE.red} />
        <Kpi label="Waiting for the PCOC" value={inStep("E").length} sub="proof sent to the PA" edge={EDGE.green} />
      </div>
      {!mailLive() && <HeldBanner />}
      <CaseLookup queue={queue} selected={c} onPick={pick} stepKey="D" />
      {c && <ProofCase key={c.rid} c={c} />}
    </>
  );
}

function ProofCase({ c }: { c: Case }) {
  const { busy, run } = useAction();
  const h = have(c);
  const rr = rowsOf(c).find((r) => r.rcpt);
  const [stkr, setStkr] = useState(c.stkr);
  const [closeSent, setCloseSent] = useState(c.closeSent);
  const proofOk = h.sign && (h.cert || !!rr);
  const m = missing(c);
  const save = (o: object, ok = "Saved.") => run("save", () => PC().saveCase(c.rid, o), (r: { stage: string }) => r?.stage && r.stage !== c.stage ? `${ok} ${c.cs} moved to ${r.stage}.` : ok);

  return (
    <section className="card">
      <CaseHead c={c} right={c.paid ? <p className="mt-1.5 text-xs text-mute">Paid {us(c.paid)}</p> : null} />
      {m[0] && <div className="mx-5 mb-3.5"><NextBox>{m[0]}</NextBox></div>}
      <DocRow state={h.sign ? "ok" : c.stkr ? "wait" : "no"} name="Sticker with the new permit number on the job sign"
        detail={c.pcoc ? `New number: ${c.pcoc}. Our inspectors put the sticker on the existing sign and send a photo.` : "Type the new permit number first (Step 2)."}
        pill={h.sign ? <Pill tone="ok">On the sign</Pill> : c.stkr ? <Pill tone="wait">Inspectors asked {us(c.stkr)}</Pill> : <Pill tone="bad">Not yet</Pill>}>
        {!c.stkr && !h.sign && <Btn kind="outline" busy={busy === "save"} onClick={() => save({ dates: { stkr: new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10) } }, "Noted: inspectors asked.")}>Inspectors asked today</Btn>}
      </DocRow>
      <DocRow state={h.sign ? "ok" : "no"} name="Photo of the job sign with the new number"
        detail={c.sign ? `${c.sign}${c.signOn ? " · " + us(c.signOn) : ""}` : "The date is set by itself when you upload."}
        pill={h.sign ? <Pill tone="ok">In hand</Pill> : <Pill tone="bad">Not here yet</Pill>}>
        {c.sign && <Btn kind="outline" onClick={() => view(caseFile(c, 30), `Sign photo - ${c.cs}`)}><Eye className="h-4 w-4" />View</Btn>}
        <FileBtn label={c.sign ? "Replace" : "Upload photo"} accept="image/*,.pdf" busy={busy === "save"} onFile={(f) => save({ files: { sign: f } }, "Sign photo saved.")} />
      </DocRow>
      <DocRow state={h.cert || rr ? "ok" : "no"} name="Proof we paid: town receipt or town letter (certificación)"
        detail={c.cert ? `Town letter: ${c.cert}` : rr ? `Receipt: ${fname(rr.rcpt)}` : "Upload the town letter, or log the trip with its receipt."}
        pill={h.cert || rr ? <Pill tone="ok">On file</Pill> : <Pill tone="bad">Missing</Pill>}>
        {rr && <Btn kind="outline" onClick={() => view(rowFile(rr, 38), `Receipt - ${c.cs}`)}><Eye className="h-4 w-4" />Receipt</Btn>}
        {c.cert && <Btn kind="outline" onClick={() => view(caseFile(c, 28), `Town letter - ${c.cs}`)}><Eye className="h-4 w-4" />Town letter</Btn>}
        <FileBtn label="Add town letter" accept=".pdf,image/*" busy={busy === "save"} onFile={(f) => save({ files: { cert: f } }, "Town letter saved.")} />
      </DocRow>
      <div className="grid grid-cols-1 gap-3 border-t border-[#eef1f6] px-5 py-3.5 md:grid-cols-3">
        <DateField label="Asked the inspectors on" value={stkr} onChange={setStkr} />
        <DateField label="Proof sent to the PA on" value={closeSent} onChange={setCloseSent} />
      </div>
      <ActionBar note={<>Sending moves this case to <b>5 · PCOC issued</b> once the email has gone out, or when "Proof sent to the PA on" has a date.</>}>
        <Btn kind="go" busy={busy === "close"} disabled={!proofOk} onClick={() => run("close", () => PC().mail(c.rid, "close"), mailToast)}><Send className="h-4 w-4" />Send proof to the PA</Btn>
        <Btn kind="outline" busy={busy === "save"} onClick={() => save({ dates: { stkr, closeSent } })}>Save</Btn>
        <span className="text-[13px]">{proofOk ? <MailNote c={c} kind="close" /> : <>Still needed: <b>{[!h.sign && "the sign photo", !(h.cert || rr) && "the receipt or town letter"].filter(Boolean).join(" and ")}</b>.</>}</span>
      </ActionBar>
    </section>
  );
}
