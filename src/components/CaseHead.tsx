import React, { useEffect, useState } from "react";
import { Pill } from "./ui";
import { type Case, PC, caseAmt, daysOf, limitOf, money, msOf, overdue, rowsOf, stageOf, us } from "@/lib/engine";

/** The top of a case card: number, who/where, money, step pill, Drive folder. */
export default function CaseHead({ c, right }: { c: Case; right?: React.ReactNode }) {
  const R = rowsOf(c);
  const r0 = R[0];
  const added = caseAmt(c);
  const s = stageOf(c);
  const late = overdue(c);
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 px-5 py-4">
      <div>
        <h2 className="m-0 text-lg font-bold">{c.cs}</h2>
        <p className="mt-0.5 text-xs text-mute">
          {[c.ho, c.muni, c.addr || r0?.addr, c.fam].filter(Boolean).join(" · ")}
        </p>
        {r0 && (
          <p className="mt-1.5 text-xs text-mute">
            Permitted cost {money(r0.atpermit)} → revised {money(r0.connow)} ·{" "}
            <b className="text-ink">{added < 0 ? `${money(Math.abs(added))} less scope` : `+${money(added)} added scope`}</b>
            {c.pcoc && <> · new permit <b className="text-ink">{c.pcoc}</b></>}
          </p>
        )}
        <Milestones c={c} />
      </div>
      <div className="text-right">
        <Pill tone={late ? "bad" : daysOf(c) > limitOf(s?.k ?? "A") / 2 ? "wait" : "grey"}>
          {s?.k === "I" ? "Intake" : s && s.k !== "X" ? `Step ${"ABCDE".indexOf(s.k) + 1}` : c.stage} · {daysOf(c)} days
        </Pill>
        {right}
        <DrivePapers c={c} />
        {c.dfold && (
          <div className="mt-0.5">
            <a href={c.dfold} target="_blank" rel="noreferrer" className="text-xs text-mute">Case folder in Drive (scope files)</a>
          </div>
        )}
      </div>
    </div>
  );
}

/** The case's PCOC papers folder in Drive (one folder per case number). Papers are copied there by
 *  themselves after a save; "Copy now" does it on demand. */
function DrivePapers({ c }: { c: Case }) {
  const [link, setLink] = useState<string | null>(null);
  const [state, setState] = useState<"" | "busy" | "err">("");
  const [note, setNote] = useState("");
  useEffect(() => {
    let live = true;
    fetch(`/api/drive?rid=${c.rid}`, { credentials: "same-origin" })
      .then((r) => r.json()).then((j) => { if (live && j.folderLink) setLink(j.folderLink); }).catch(() => {});
    const off = PC().on("drive", (d: { rid: string; result?: { folderLink: string | null; filed: string[]; replaced: string[]; errors: string[] }; error?: string }) => {
      if (String(d.rid) !== String(c.rid) || !live) return;
      if (d.error) { setState("err"); setNote(d.error); return; }
      setState("");
      if (d.result?.folderLink) setLink(d.result.folderLink);
      const n = (d.result?.filed.length ?? 0) + (d.result?.replaced.length ?? 0);
      setNote(d.result?.errors.length ? `Not copied: ${d.result.errors.join("; ")}` : n ? `${n} paper${n === 1 ? "" : "s"} copied just now` : "");
    });
    return () => { live = false; off(); };
  }, [c.rid]);
  const copy = () => { setState("busy"); PC().driveSync(c.rid, true).catch(() => {}); };
  return (
    <div className="mt-1 text-xs">
      {link ? <a href={link} target="_blank" rel="noreferrer">Papers in Drive ({c.cs})</a> : <span className="text-mute">No papers in Drive yet</span>}
      {" · "}
      <button type="button" className="font-semibold text-navy underline disabled:opacity-60" disabled={state === "busy"} onClick={copy}>{state === "busy" ? "Copying…" : "Copy now"}</button>
      {note && <div className={state === "err" ? "text-bad-ink" : "text-mute"}>{note}</div>}
    </div>
  );
}

/** Canopy milestones from the Job: Structure is the heads-up, Substantial/Finishes is when the work starts. */
export function Milestones({ c }: { c: Case }) {
  const m = msOf(c);
  return (
    <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-mute">
      <span>Structure:</span>{m.structure ? <Pill tone="ok">{us(m.structure)}</Pill> : <Pill>not passed</Pill>}
      <span className="ml-1">Substantial/Finishes:</span>{m.substantial ? <Pill tone="ok">{us(m.substantial)}</Pill> : <Pill tone="wait">not passed yet</Pill>}
      {m.goal && <span className="ml-1">Canopy milestone goal: <b className="text-ink">{m.goal}</b></span>}
    </p>
  );
}
