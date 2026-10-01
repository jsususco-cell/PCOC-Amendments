import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Btn, Confirm, Empty, PageTitle, Pill, useAction } from "@/components/ui";
import { type Case, PC, cases, money, pathOf, rowsOf, rows, us, useEngine } from "@/lib/engine";
import { cn } from "@/lib/utils";

type ListKey = "recent" | "structure" | "finished" | "refund" | "notreq";
const LISTS: { k: ListKey; label: string; stage?: string; help: string }[] = [
  { k: "recent", label: "New scope changes", help: "Scope changes Canopy approved in the last 45 days, and the step their case is in now." },
  { k: "structure", label: "Waiting on Structure", stage: "Waiting · Structure not passed", help: "Rebuilt houses. The amendment does not start until the Structure inspection passes. They move to Step 1 by themselves when it does." },
  { k: "finished", label: "Finished house: needs a decision", stage: "Finished · confirm with Priscilla", help: "These houses are finished. One rule decides all of them (below)." },
  { k: "refund", label: "Refund owed to us", stage: "Refund owed to us", help: "The job cost went DOWN, so the town may owe us money back." },
  { k: "notreq", label: "Not required", stage: "Not required", help: "No amendment needed. Reopen one here if that changes." },
];
const RULES = ["Ask Priscilla", "Yes - still required", "No - finished means done"];

type Decision = { c: Case; kind: "amend" | "notreq" | "refund"; label: string };

export default function Intake() {
  useEngine();
  const [tab, setTab] = useState<ListKey>("recent");
  const [rule, setRule] = useState<string>("");
  const [ask, setAsk] = useState<Decision | null>(null);
  const [askRule, setAskRule] = useState<string | null>(null);
  const { busy, run } = useAction();
  useEffect(() => { PC().getFinishedRule().then(setRule).catch(() => setRule("")); }, []);

  const all = cases();
  const count = (k: ListKey) => k === "recent" ? recent().length : all.filter((c) => c.stage === LISTS.find((l) => l.k === k)!.stage).length;
  const cur = LISTS.find((l) => l.k === tab)!;

  const decide = (d: Decision) => run("d" + d.c.rid, () => PC().decide(d.c.rid, d.kind), `${d.c.cs}: ${d.label}.`);

  return (
    <>
      <PageTitle title="Intake" who="Priscilla" ends="each case is decided: needs an amendment, parked, or not required." />
      <div className="next">New scope changes come from Canopy by themselves. You only decide. A case moves to <b>1 · Prepare</b> the moment you press <b>Needs an amendment</b>.</div>

      <div role="tablist" aria-label="Intake lists" className="flex flex-wrap gap-1.5">
        {LISTS.map((l) => (
          <button key={l.k} role="tab" aria-selected={tab === l.k} onClick={() => setTab(l.k)}
            className={cn("inline-flex h-10 items-center gap-2 rounded-full border px-3.5 text-[13px] font-semibold",
              tab === l.k ? "border-navy bg-navy text-white" : "border-[#cfd6e2] bg-white text-navy hover:border-navy")}>
            {l.label}
            <span className={cn("min-w-[22px] rounded-full px-1.5 text-[11px] font-bold", tab === l.k ? "bg-white/20" : "bg-[#eef1f6] text-[#475066]")}>{count(l.k)}</span>
          </button>
        ))}
      </div>
      <p className="-mt-2 text-[13px] text-mute">{cur.help}</p>

      {tab === "recent" ? <Recent /> : (
        <section className="card overflow-x-auto">
          <CaseTable list={all.filter((c) => c.stage === cur.stage)} tab={tab} busy={busy} onDecide={setAsk} />
        </section>
      )}

      {tab === "finished" && (
        <section className="card flex flex-wrap items-center justify-between gap-4 px-5 py-4">
          <div>
            <div className="kpi-label">Finished houses: one rule for all of them</div>
            <div className="mt-1 text-[13.5px]">Do finished houses still need the amendment? Today: <Pill tone="wait">{rule || "…"}</Pill></div>
            <div className="mt-0.5 text-xs text-mute">"Yes" sends them to Step 1. "No" marks them not required. Saved in KTO Program Defaults.</div>
          </div>
          <div className="flex gap-2">
            {RULES.filter((r) => r !== rule).map((r) => (
              <Btn key={r} kind={r.startsWith("Yes") ? "primary" : "outline"} busy={busy === "rule"} onClick={() => setAskRule(r)}>{r}</Btn>
            ))}
          </div>
        </section>
      )}

      <Confirm open={!!ask} title={ask ? `${ask.c.cs}: ${ask.label}?` : ""} action={ask?.label ?? ""}
        body={ask && <>This sets every open scope change on <b>{ask.c.cs}</b> ({rowsOf(ask.c).length}) and the case itself. {ask.kind === "amend" && "The case moves to 1 · Prepare."}</>}
        onCancel={() => setAsk(null)} onOk={() => { const d = ask!; setAsk(null); decide(d); }} />
      <Confirm open={!!askRule} title="Change the finished-house rule?" action={askRule ?? ""}
        body={<>Every case in "Finished house: needs a decision" follows this rule on the next sync.</>}
        onCancel={() => setAskRule(null)}
        onOk={() => { const r = askRule!; setAskRule(null); run("rule", () => PC().finishedRule(r).then(() => setRule(r)), "Rule saved."); }} />
    </>
  );
}

function CaseTable({ list, tab, busy, onDecide }: { list: Case[]; tab: ListKey; busy: string | null; onDecide: (d: Decision) => void }) {
  if (!list.length) return <Empty>No cases here.</Empty>;
  return (
    <table className="w-full border-collapse">
      <thead><tr><th className="th">Case</th><th className="th">Scope changes</th><th className="th text-right">Added scope</th><th className="th">Latest approval</th><th className="th">Structure passed</th><th className="th">Decide</th></tr></thead>
      <tbody>
        {list.map((c) => {
          const R = rowsOf(c);
          const amt = R.reduce((t, r) => t + (r.amt || 0), 0);
          const appr = R.map((r) => r.appr).sort().pop() ?? "";
          const sp = R.find((r) => r.sp)?.sp ?? "";
          const b = busy === "d" + c.rid;
          return (
            <tr key={c.rid}>
              <td className="td"><b>{c.cs}</b><div className="text-xs text-mute">{c.muni} · {c.fam}</div></td>
              <td className="td">{R.map((r) => r.sc).join(", ")}<div className="text-xs text-mute">{R[0]?.typ}</div></td>
              <td className={cn("td text-right font-bold", amt < 0 && "text-bad-ink")}>{amt < 0 ? `${money(Math.abs(amt))} back` : money(amt)}</td>
              <td className="td">{us(appr)}</td>
              <td className="td">{c.fam === "RECON" ? (sp ? <Pill tone="ok">{us(sp)}</Pill> : <Pill tone="wait">not yet</Pill>) : <span className="text-xs text-mute">n/a</span>}</td>
              <td className="td">
                <div className="flex flex-wrap gap-1.5">
                  {tab !== "structure" || sp ? <Btn busy={b} onClick={() => onDecide({ c, kind: "amend", label: "Needs an amendment" })}>Needs an amendment</Btn> : <span className="text-xs text-mute">Moves by itself once Structure passes</span>}
                  {tab !== "notreq" && <Btn kind="outline" busy={b} onClick={() => onDecide({ c, kind: "notreq", label: "Not required" })}>Not required</Btn>}
                  {tab !== "refund" && amt < 0 && <Btn kind="outline" busy={b} onClick={() => onDecide({ c, kind: "refund", label: "Refund owed to us" })}>Refund owed</Btn>}
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function recent() {
  const cut = new Date(Date.now() - 45 * 864e5).toISOString().slice(0, 10);
  return rows().filter((r) => r.appr && r.appr >= cut).sort((a, b) => b.appr.localeCompare(a.appr));
}

function Recent() {
  const L = recent();
  if (!L.length) return <section className="card"><Empty>No scope changes approved in the last 45 days.</Empty></section>;
  return (
    <section className="card overflow-x-auto">
      <table className="w-full border-collapse">
        <thead><tr><th className="th">Case</th><th className="th">Canopy scope change</th><th className="th">Approved in Canopy</th><th className="th text-right">Added scope</th><th className="th">Permit date</th><th className="th">Case is at</th></tr></thead>
        <tbody>
          {L.map((r) => {
            const c = cases().find((x) => x.cs === r.cs);
            return (
              <tr key={r.rid}>
                <td className="td"><b>{r.cs}</b><div className="text-xs text-mute">{r.muni} · {r.fam}</div></td>
                <td className="td">{r.sc}<div className="text-xs text-mute">{r.typ}</div></td>
                <td className="td">{us(r.appr)}</td>
                <td className={cn("td text-right font-bold", r.amt < 0 && "text-bad-ink")}>{r.amt < 0 ? `${money(Math.abs(r.amt))} back` : money(r.amt)}</td>
                <td className="td">{us(r.permit)}</td>
                <td className="td">{c ? <Link to={pathOf(c)}>{c.stage}</Link> : <span className="text-xs text-mute">Not synced yet: press Sync now on the Board</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
