import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Empty, HeldBanner, PageTitle, Pill } from "@/components/ui";
import { PC, W, mailLive, us, useEngine } from "@/lib/engine";
import { cn } from "@/lib/utils";

interface Mail { rid: string; created: string; to: string; cc: string; subj: string; st: string; kind: string; sent: string; cs: string }
const TONE: Record<string, "ok" | "wait" | "bad" | "navy" | "grey"> = { Sent: "ok", Draft: "wait", Queued: "navy", Failed: "bad", Cancelled: "grey" };

export default function Emails() {
  useEngine();
  const [list, setList] = useState<Mail[] | null>(null);
  const [err, setErr] = useState("");
  const [f, setF] = useState("All");
  useEffect(() => { PC().outbox().then(setList).catch((e: Error) => setErr(e.message)); }, []);
  const set = W.G?.set ?? {};
  const counts = (s: string) => (list ?? []).filter((m) => s === "All" || m.st === s).length;
  const L = (list ?? []).filter((m) => f === "All" || m.st === f);

  return (
    <>
      <PageTitle title="Emails" />
      <p className="-mt-3 text-[13px] text-mute">Every PCOC email goes through the KTO Outbox. A step date is set only when its email has really been sent.</p>
      {mailLive()
        ? <div className="rounded-xl border border-[#c4e3d0] bg-ok-bg px-4 py-2.5 text-[13px] text-ok-ink"><b>Emails are on.</b> Pressing an email button queues it and it goes out.</div>
        : <HeldBanner />}

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="card overflow-x-auto">
          <div className="flex flex-wrap gap-1.5 border-b border-line px-3.5 py-3">
            {["All", "Draft", "Queued", "Sent", "Failed"].map((s) => (
              <button key={s} onClick={() => setF(s)} className={cn("h-8 rounded-full border px-3 text-[12.5px] font-semibold", f === s ? "border-navy bg-navy text-white" : "border-[#cfd6e2] bg-white text-navy")}>
                {s} {counts(s)}
              </button>
            ))}
          </div>
          {err ? <Empty>{err}</Empty> : !list ? <p className="flex items-center gap-2 px-4 py-6 text-sm text-mute"><Loader2 className="h-4 w-4 animate-spin" />Loading the Outbox…</p> : L.length === 0 ? <Empty>No emails here.</Empty> : (
            <table className="w-full border-collapse">
              <thead><tr><th className="th">Created</th><th className="th">Case</th><th className="th">Kind</th><th className="th">Subject</th><th className="th">To</th><th className="th">Status</th></tr></thead>
              <tbody>
                {L.map((m) => (
                  <tr key={m.rid}>
                    <td className="td whitespace-nowrap">{us(m.created)}</td>
                    <td className="td"><b>{m.cs || "—"}</b></td>
                    <td className="td">{m.kind.replace(/^PCOC /, "")}</td>
                    <td className="td max-w-[280px] truncate" title={m.subj}>{m.subj}</td>
                    <td className="td max-w-[200px] truncate text-xs" title={[m.to, m.cc].filter(Boolean).join(" · cc ")}>{m.to}</td>
                    <td className="td"><Pill tone={TONE[m.st] ?? "grey"}>{m.st}{m.st === "Sent" && m.sent ? ` ${us(m.sent)}` : ""}</Pill></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <aside className="card px-4 py-4 text-[13px]">
          <h2 className="m-0 text-base font-bold">Reminder rules</h2>
          <p className="mb-1.5 mt-0.5 text-xs text-mute">Written on sync. One per case and topic, at most every 7 days.</p>
          {[["Harold, new drawings", "after 7 days"], ["Final Acceptance Letter", "after 7 days"], ["The PA, amendment notice", "after 21 days"], ["Estimating, missing scope file", "once"], ["Weekly summary", "every 6 days"], ["Leslie, use permit hand-off", "by hand, at PCOC"]].map(([a, b]) => (
            <div key={a} className="flex justify-between gap-3 border-t border-[#eef1f6] py-2"><span>{a}</span><b>{b}</b></div>
          ))}
          <div className="kpi-label mt-4">Settings in Quickbase</div>
          {[["PCOC Mail Mode", set.mode], ["Emails held", set.held], ["Amendment requests to", set.to], ["Harold", set.harold], ["Close-out to", set.closeTo], ["Final Acceptance Letter requests (PMs)", set.falTo], ["Scope file requests to", set.scopeTo]].map(([a, b]) => (
            <div key={a} className="flex justify-between gap-3 border-t border-[#eef1f6] py-2"><span>{a}</span><span className="truncate text-right text-mute" title={b}>{b || "not set"}</span></div>
          ))}
          <p className="mt-3 text-xs text-mute">These live in KTO Program Defaults. Releasing held emails is done there, on purpose, not from this app.</p>
        </aside>
      </div>
    </>
  );
}
