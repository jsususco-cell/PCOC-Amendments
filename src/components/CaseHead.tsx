import React from "react";
import { Pill } from "./ui";
import { type Case, caseAmt, daysOf, limitOf, money, msOf, overdue, rowsOf, stageOf, us } from "@/lib/engine";

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
        <div className="mt-1">
          {c.dfold
            ? <a href={c.dfold} target="_blank" rel="noreferrer" className="text-xs">Open the Amendment folder in Drive</a>
            : <span className="text-xs text-mute">Drive folder is being set up</span>}
        </div>
      </div>
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
