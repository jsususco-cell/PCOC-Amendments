import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Btn, Confirm, Empty, PageTitle, Pill, useAction } from "@/components/ui";
import { type Case, PC, cases, intakeCases, structurePending, latestAppr, money, msOf, rowsOf, us, useEngine } from "@/lib/engine";
import { cn } from "@/lib/utils";

type Decision = { c: Case; kind: "amend" | "notreq"; label: string };

const PARKED_PILL: Record<string, { tone: "wait" | "bad" | "grey"; text: string }> = {
  "Waiting · Structure not passed": { tone: "grey", text: "Structure passed" },
  "Finished · confirm with Priscilla": { tone: "wait", text: "House finished" },
  "Refund owed to us": { tone: "bad", text: "Cost went down" },
};

export default function Intake() {
  useEngine();
  const nav = useNavigate();
  const [ask, setAsk] = useState<Decision | null>(null);
  const { busy, run } = useAction();
  const list = intakeCases();

  const prepare = (c: Case) => nav("/prepare?case=" + encodeURIComponent(c.cs));
  const decide = (d: Decision) => run("d" + d.c.rid, () => PC().decide(d.c.rid, d.kind).then(() => { if (d.kind === "amend") prepare(d.c); }), `${d.c.cs}: ${d.label}.`);
  const start = (c: Case) => c.stage === "A · Prepare request" ? prepare(c) : setAsk({ c, kind: "amend", label: "Start 1 · Prepare" });

  return (
    <>
      <PageTitle title="Intake" who="Priscilla" ends="each new scope change is started in 1 · Prepare, or marked not required." />
      <div className="next">
        New scope changes come in every morning from Canopy (approved after the permit, construction cost only; temporary relocation does not count).
        A case stays here until its Step 1 work begins: papers built, scope file checked, drawings or the FAL requested.
        Rebuilt houses whose Structure inspection has not passed are left out ({cases().filter(structurePending).length} now); they come in once it passes.
      </div>

      <section className="card overflow-x-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3.5">
          <div>
            <h2 className="m-0 text-base font-bold">New scope changes</h2>
            <div className="text-xs text-mute">Newest approval first.</div>
          </div>
          <Pill tone={list.length ? "navy" : "ok"}>{list.length} case{list.length === 1 ? "" : "s"}</Pill>
        </div>
        {!list.length ? <Empty>No new scope changes. Everything is in a step already.</Empty> : (
          <table className="w-full border-collapse">
            <thead><tr><th className="th">Case</th><th className="th">Canopy scope changes</th><th className="th">Approved</th><th className="th text-right">Amendment amount</th><th className="th">Inspections</th><th className="th">Next</th></tr></thead>
            <tbody>
              {list.map((c) => {
                const R = rowsOf(c);
                const amt = R.reduce((t, r) => t + (r.amt || 0), 0);
                const sp = R.find((r) => r.sp)?.sp ?? "";
                const sub = msOf(c).substantial;
                const p = PARKED_PILL[c.stage];
                const b = busy === "d" + c.rid;
                return (
                  <tr key={c.rid}>
                    <td className="td"><b>{c.cs}</b><div className="text-xs text-mute">{c.muni} · {c.fam}</div>{p && <div className="mt-1"><Pill tone={p.tone}>{p.text}</Pill></div>}</td>
                    <td className="td">{R.map((r) => r.sc).join(", ")}<div className="text-xs text-mute">{R[0]?.typ}</div></td>
                    <td className="td">{us(latestAppr(c))}</td>
                    <td className={cn("td text-right font-bold", amt < 0 && "text-bad-ink")}>{amt < 0 ? `${money(Math.abs(amt))} back` : money(amt)}</td>
                    <td className="td text-xs">
                      {c.fam === "RECON" && <div>Structure {sp ? <Pill tone="ok">{us(sp)}</Pill> : <Pill tone="wait">not yet</Pill>}</div>}
                      <div className="mt-1">Substantial {sub ? <Pill tone="ok">{us(sub)}</Pill> : <Pill tone="wait">not yet</Pill>}</div>
                    </td>
                    <td className="td">
                      <div className="flex flex-wrap gap-1.5">
                        <Btn busy={b} onClick={() => start(c)}>Start 1 · Prepare</Btn>
                        <Btn kind="outline" busy={b} onClick={() => setAsk({ c, kind: "notreq", label: "Not required" })}>Not required</Btn>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <Confirm open={!!ask} title={ask ? `${ask.c.cs}: ${ask.label}?` : ""} action={ask?.label ?? ""}
        body={ask && <>This sets every open scope change on <b>{ask.c.cs}</b> ({rowsOf(ask.c).length}) and the case itself. {ask.kind === "amend" ? "The case moves to 1 · Prepare." : "It leaves Intake."}</>}
        onCancel={() => setAsk(null)} onOk={() => { const d = ask!; setAsk(null); decide(d); }} />
    </>
  );
}
