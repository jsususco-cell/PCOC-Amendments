import { useState } from "react";
import { toast } from "sonner";
import { Eye, FileText, Mail, Send, Sparkles } from "lucide-react";
import { ActionBar, Btn, DateField, DocRow, EDGE, FileBtn, HeldBanner, Kpi, NextBox, PageTitle, Pill, TextField, useAction } from "@/components/ui";
import CaseLookup, { FromBanner } from "@/components/CaseLookup";
import CaseHead from "@/components/CaseHead";
import ScopePreview from "@/components/ScopePreview";
import MailNote, { mailToast } from "@/components/MailNote";
import { type Case, PC, W, caseFile, cases, canStart, daysOf, downloadUrl, have, inStep, intakeCases, noteSave, noteText, limitOf, mailLive, missing, money, msOf, rowFile, rowsOf, todayIso, us, useEngine, view } from "@/lib/engine";
import { useSelectedCase } from "@/lib/useCase";

export default function Prepare() {
  useEngine();
  const queue = inStep("A");
  const [c, pick] = useSelectedCase(queue);
  const oldest = queue[0];
  const headsUp = queue.filter((x) => !msOf(x).substantial).length;
  const noScope = queue.filter((x) => !(x.estChk || "").startsWith("MATCH")).length;

  return (
    <>
      <PageTitle title="1 · Prepare" who="Priscilla" ends="the 3 papers (Project Narrative, Cost Estimate, Harold's revised drawings) are sent to the PA." />
      <p className="-mt-3 text-[13px] text-mute">A case comes here when Start 1 · Prepare is pressed in Intake: the construction cost went up and the Substantial/Finishes inspection passed.</p>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="In this step" value={queue.length} sub={`limit ${limitOf("A")} days`} edge={EDGE.navy} />
        <Kpi label="Oldest" value={oldest ? `${daysOf(oldest)} days` : "—"} sub={oldest?.cs ?? "nothing waiting"} edge={EDGE.amber} />
        <Kpi label="Heads-up only" value={headsUp} sub="Structure passed, Substantial not yet" edge={EDGE.amber} />
        <Kpi label="No current scope file" value={noScope} sub="scope file does not match Canopy yet" edge={EDGE.amber} />
      </div>
      {!mailLive() && <HeldBanner />}
      <CaseLookup queue={queue} selected={c} onPick={pick} stepKey="A"
        from={{ label: "Intake: new scope changes", list: intakeCases() }} />
      {c ? <PrepareCase key={c.rid} c={c} /> : null}
    </>
  );
}

const DETAILS: [keyof Case, string][] = [
  ["addr", "Address"], ["exSf", "Old house size (sq ft)"], ["lot", "Lot size (m2)"],
  ["model", "New house model"], ["newSf", "New house size (sq ft)"], ["aps", "APS design number"],
];

function PrepareCase({ c }: { c: Case }) {
  const { busy, run } = useAction();
  const h = have(c);
  const R = rowsOf(c);
  const r2 = R.find((r) => r.d2 || r.l2);
  const chk = c.estChk || "";
  const match = chk.startsWith("MATCH");
  const mism = chk.startsWith("MISMATCH");
  const sf: Record<string, string>[] = W.sfOf(c) ?? [];
  /* What the build wrote into the check: which generator, and what each revises. */
  const between = (from: string, until: string) => {
    const i = chk.indexOf(from);
    if (i < 0) return "";
    const j = until ? chk.indexOf(until, i + from.length) : -1;
    return chk.slice(i, j < 0 ? undefined : j).trim();
  };
  const estBy = between("Cost Estimate built by the Permitting Helper", " Narrative");
  const narBy = between("Narrative built by the Permitting Helper", "");
  const helperNarr = !!narBy;
  const [txt, setTxt] = useState<Record<string, string>>(() => ({
    addr: c.addr || R[0]?.addr || "", exSf: c.exSf, lot: c.lot, model: c.model, newSf: c.newSf, aps: c.aps,
    chg: c.chg, oNarr: c.oNarr, oEst: c.oEst, note: noteText(c),
  }));
  const [sentPA, setSentPA] = useState(c.sentPA);
  const set = (k: string) => (v: string) => setTxt((t) => ({ ...t, [k]: v }));
  const need = [!h.drw && "Harold's drawings", !h.narr && "the Narrative", !(h.est && (!chk || match)) && "a Cost Estimate that matches Canopy"].filter(Boolean) as string[];
  const m = missing(c);
  const [preview, setPreview] = useState(false);

  /* What the build did, from the check it wrote on the case. */
  /* What the build did: which generator made each paper, and what it revises. */
  type Built = { c: Case; result: { match?: boolean; total?: number; now?: number; narrative?: string; narrativeReason?: string | null } };
  const built = ({ result: r }: Built) => {
    const narr = r.narrative === "helper" ? "Narrative made by the Permitting Helper (revised)." : `PCOC Narrative made${r.narrativeReason ? ` (${r.narrativeReason})` : ""}.`;
    if (r.match === undefined) return narr;
    if (r.match) return `Cost Estimate made by the Permitting Helper (revised); the scope file matches Canopy. ${narr}`;
    toast.warning(`The Cost Estimate was NOT saved: the scope file's total ${money(r.total ?? 0)} does not match Canopy's ${money(r.now ?? 0)}. ${narr}`, { duration: 15000 });
    return "";
  };
  const build = () => run("build", () => PC().buildDocs(c.rid), built);
  /* Upload starts the build: one step instead of two. */
  const uploadScope = (f: File) => run("build", async () => {
    await PC().saveCase(c.rid, { files: { scx: f } });
    return PC().buildDocs(c.rid);
  }, built);

  const save = (o: object, ok = "Saved.") => run("save", () => PC().saveCase(c.rid, o), (r: { stage: string; from: string }) => r?.stage && r.from && r.stage !== r.from ? `${ok} ${c.cs} moved to ${r.stage}.` : ok);
  const mail = (key: string) => run("m" + key, () => PC().mail(c.rid, key), mailToast);

  return (
    <section className="card">
      {preview && <ScopePreview c={c} onClose={() => setPreview(false)} />}
      <CaseHead c={c} right={<p className="mt-1.5 text-sm"><b>{3 - need.length}</b> <span className="text-xs text-mute">of 3 papers ready</span></p>} />
      <FromBanner c={c} stepKey="A">
        {canStart(c).ok ? <Btn busy={busy === "move"} onClick={() => run("move", () => PC().start(c.rid), `${c.cs} moved to 1 · Prepare.`)}>Move to 1 · Prepare</Btn> : <span className="text-xs text-mute">Cannot start yet: {canStart(c).why}</span>}
        <span className="text-xs text-mute">It needs an amendment: the work starts here.</span>
      </FromBanner>
      {m[0] && <div className="mx-5 mb-3.5"><NextBox>{m[0]}</NextBox></div>}
      {c.issues && <div className="mx-5 mb-3.5 rounded-lg border border-[#fed7aa] bg-[#fff7ed] px-3 py-2 text-xs text-[#9a3412]">Heads up, the OLD narrative for this case had mistakes: {c.issues} The new one fixes this.</div>}

      <DocRow state={match ? "ok" : mism ? "no" : c.scx ? "wait" : "no"} name="Scope file (Xactimate PDF or Canopy Excel)"
        detail={c.scx ? `${c.scx}${chk ? " · " + chk.replace(/^(MATCH|MISMATCH) /, "") : ""}` : "Looked for in Drive every night. Upload it here if you have it."}
        pill={match ? <Pill tone="ok">Matches Canopy</Pill> : mism ? <Pill tone="bad">Does not match Canopy</Pill> : c.scx ? <Pill tone="wait">Not checked yet</Pill> : <Pill tone="bad">Not here yet</Pill>}>
        {c.scx && <Btn kind="outline" onClick={() => setPreview(true)}><Eye className="h-4 w-4" />View</Btn>}
        <FileBtn label={c.scx ? "Replace" : "Upload"} accept=".pdf,.xls,.xlsx" busy={busy === "build"} onFile={uploadScope} />
      </DocRow>
      {sf.length > 0 && (
        <details className="border-t border-[#eef1f6] px-5 py-2.5 text-xs">
          <summary className="cursor-pointer font-semibold text-navy">Scope files found in Drive ({sf.length})</summary>
          <ul className="mt-2 space-y-1">
            {sf.map((s) => (
              <li key={s.rid} className="flex flex-wrap gap-2">
                <span className="font-medium">{String(s["8"] || "").split(/https?:\/\//)[0]}</span>
                <span className="text-mute">{s["12"] || "not checked yet"}{s["13"] ? ` · ${money(Number(s["13"]))}` : ""}</span>
                {s["18"] && <a href={s["18"]} target="_blank" rel="noreferrer">Drive</a>}
              </li>
            ))}
          </ul>
        </details>
      )}
      <div className="flex flex-wrap items-center gap-3 border-t border-[#eef1f6] px-5 py-3.5">
        <Btn kind="go" busy={busy === "build"} onClick={build}><Sparkles className="h-4 w-4" />Make the Cost Estimate and Narrative</Btn>
        <span className="text-xs text-mute">{busy === "build" ? "Reading the scope file and making the papers…" : c.scx ? "Uploading a scope file does this by itself. Press again after fixing the house details below." : "No scope file yet: only the Narrative can be made."}</span>
      </div>

      <DocRow state={h.estOk ? "ok" : h.est && !mism ? "wait" : "no"} name="Cost Estimate"
        detail={<>{r2 ? `Estimado de Costos Revisado${R.find((r) => r.estOn)?.estOn ? " · made " + us(R.find((r) => r.estOn)!.estOn) : ""}` : "Made by the Permitting Helper from a scope file that matches Canopy."}
          {estBy && <span className="block">{estBy}{c.oEst && <> <a href={c.oEst} target="_blank" rel="noreferrer">Open the original</a></>}</span>}</>}
        pill={h.estOk ? <Pill tone="ok">Checked {us(c.estOk)}</Pill> : h.est ? (mism ? <Pill tone="bad">Scope file does not match</Pill> : <Pill tone="wait">Needs checking</Pill>) : <Pill tone="bad">Not made yet</Pill>}>
        {r2 && <Btn kind="outline" onClick={() => r2.l2 ? window.open(r2.l2, "_blank") : view(rowFile(r2, 47), `Cost Estimate - ${c.cs}`)}><Eye className="h-4 w-4" />View</Btn>}
        {h.est && !h.estOk && <Btn busy={busy === "save"} onClick={() => save({ dates: { estOk: todayIso() } }, "Estimate marked checked.")}>Mark checked</Btn>}
      </DocRow>

      <DocRow state={h.narrOk ? "ok" : h.narr ? "wait" : "no"} name="Project Narrative"
        detail={<>{c.narr ? `${c.narr}${c.word && !helperNarr ? " · Word copy for changes" : ""}` : "Made by the green button."}
          {c.narr && <span className="block">{helperNarr ? narBy : "PCOC template: the Permitting Helper has no finished narrative for this case to revise."}{helperNarr && c.oNarr && <> <a href={c.oNarr} target="_blank" rel="noreferrer">Open the original</a></>}</span>}</>}
        pill={h.narrOk ? <Pill tone="ok">Checked {us(c.narrOk)}</Pill> : h.narr ? <Pill tone="wait">Needs checking</Pill> : <Pill tone="bad">Not made yet</Pill>}>
        {c.narr && <Btn kind="outline" onClick={() => view(caseFile(c, 12), `Project Narrative - ${c.cs}`)}><Eye className="h-4 w-4" />View</Btn>}
        {c.word && !helperNarr && <a className="btn border-[#cfd6e2] bg-white text-navy no-underline hover:border-navy" href={downloadUrl(caseFile(c, 54))} download><FileText className="h-4 w-4" />Word</a>}
        {h.narr && !h.narrOk && <Btn busy={busy === "save"} onClick={() => save({ dates: { narrOk: todayIso() } }, "Narrative marked checked.")}>Mark checked</Btn>}
      </DocRow>

      <DocRow state={h.drw ? "ok" : c.drwReq ? "wait" : "no"} name="Harold's revised drawings"
        detail={<>{c.drw ? `${c.drw}${c.drwRec ? " · uploaded " + us(c.drwRec) : ""}` : "Signed by Harold. They should already be in Smartsheet: upload them here."}{c.drwReq && !c.drw && ` Asked Harold ${us(c.drwReq)}.`}<MailNote c={c} kind="drw" /></>}
        pill={h.drw ? <Pill tone="ok">In hand</Pill> : <Pill tone="bad">Not here yet</Pill>}>
        {c.drw && <Btn kind="outline" onClick={() => view(caseFile(c, 15), `Drawings - ${c.cs}`)}><Eye className="h-4 w-4" />View</Btn>}
        <FileBtn label={c.drw ? "Replace" : "Upload drawings"} kind={c.drw ? "outline" : "primary"} accept=".pdf,image/*" busy={busy === "save"} onFile={(f) => save({ files: { drw: f } }, "Drawings saved.")} />
        {!c.drw && (
          <details className="text-xs">
            <summary className="cursor-pointer py-2.5 font-semibold text-navy">Not in Smartsheet?</summary>
            <div className="flex flex-wrap gap-1.5">
              <Btn kind="outline" busy={busy === "mdrw"} disabled={!h.narr || !W.G?.set?.harold} title={!h.narr ? "Make the Narrative first" : ""} onClick={() => mail("drw")}><Mail className="h-4 w-4" />{c.drwReq ? "Ask Harold again" : "Ask Harold"}</Btn>
              {c.drwReq && <Btn kind="outline" busy={busy === "rem"} onClick={() => run("rem", () => PC().remindHarold(c.rid), mailToast)}>Remind Harold</Btn>}
            </div>
          </details>
        )}
      </DocRow>

      <DocRow state={h.fal ? "ok" : c.falReq ? "wait" : "no"} name="Final Acceptance Letter (for the town, later)"
        detail={<>{c.fal || (c.falReq ? `Asked the PMs ${us(c.falReq)}` : "Ask the PMs now, so it is here by the time you pay the town. A short email, no attachments.")}<MailNote c={c} kind="fal" /></>}
        pill={h.fal ? <Pill tone="ok">In hand</Pill> : c.falReq ? <Pill tone="wait">Asked</Pill> : <Pill tone="bad">Not asked</Pill>}>
        {c.fal && <Btn kind="outline" onClick={() => view(caseFile(c, 24), `Final Acceptance Letter - ${c.cs}`)}><Eye className="h-4 w-4" />View</Btn>}
        {!h.fal && <Btn kind="outline" busy={busy === "mfal"} onClick={() => mail("fal")}><Mail className="h-4 w-4" />{c.falReq ? "Ask the PMs again" : "Ask the PMs"}</Btn>}
        <FileBtn label={h.fal ? "Replace" : "Upload"} accept=".pdf,image/*" busy={busy === "save"} onFile={(f) => save({ files: { fal: f } }, "Final Acceptance Letter saved.")} />
      </DocRow>

      <details className="border-t border-[#eef1f6] px-5 py-3">
        <summary className="cursor-pointer text-[13px] font-semibold text-navy">House details used in the Narrative (fix them here, then press the green button again)</summary>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
          {DETAILS.map(([k, l]) => <TextField key={k} label={l} value={txt[k]} onChange={set(k)} />)}
        </div>
        <label className="label mt-3">What changed and why (goes into the Narrative)
          <textarea rows={4} className="input h-auto py-2" value={txt.chg || ""} onChange={(e) => set("chg")(e.target.value)} />
        </label>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          <TextField label="Old narrative (link)" value={txt.oNarr} onChange={set("oNarr")} />
          <TextField label="Old cost estimate (link)" value={txt.oEst} onChange={set("oEst")} />
        </div>
        <Btn className="mt-3" kind="outline" busy={busy === "save"} onClick={() => save({ texts: txt }, "House details saved.")}>Save details</Btn>
      </details>

      <div className="grid grid-cols-1 gap-3 border-t border-[#eef1f6] px-5 py-3.5 md:grid-cols-[220px_1fr]">
        <DateField label="Sent to the PA on" value={sentPA} onChange={setSentPA} />
        <label className="label">Notes (anything the team should know)
          <textarea rows={2} className="input h-auto py-2" value={txt.note || ""} onChange={(e) => set("note")(e.target.value)} />
        </label>
      </div>

      <ActionBar note={<>Sending moves this case to <b>2 · With the PA</b> once the email has gone out, or when "Sent to the PA on" has a date.</>}>
        <Btn kind="go" busy={busy === "mpa"} disabled={need.length > 0} onClick={() => mail("pa")}><Send className="h-4 w-4" />Send the 3 papers to the PA</Btn>
        <Btn kind="outline" busy={busy === "save"} onClick={() => save({ dates: { sentPA }, texts: { note: noteSave(c, txt.note || "") } })}>Save</Btn>
        <span className="text-[13px]">{need.length ? <>Still needed: <b>{need.join(", ")}</b>.</> : <MailNote c={c} kind="pa" />}</span>
      </ActionBar>
    </section>
  );
}
