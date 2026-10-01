import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Search } from "lucide-react";
import { Btn } from "./ui";
import { type Case, cases, daysOf, pathOf, stageOf } from "@/lib/engine";
import { cn } from "@/lib/utils";

/**
 * Case ID box + the cases in this step, oldest first — the same shape as the
 * Permitting Helper's lookup card.
 */
export default function CaseLookup({ queue, selected, onPick, stepKey }:
  { queue: Case[]; selected: Case | null; onPick: (cs: string) => void; stepKey: string }) {
  const [q, setQ] = useState(selected?.cs ?? "");
  const [msg, setMsg] = useState<{ text: string; link?: string } | null>(null);
  useEffect(() => { setQ(selected?.cs ?? ""); }, [selected?.cs]);

  const look = () => {
    const want = q.trim().toUpperCase();
    if (!want) return;
    const c = cases().find((x) => x.cs.toUpperCase() === want) ?? cases().find((x) => x.cs.toUpperCase().includes(want));
    if (!c) { setMsg({ text: `No PCOC amendment case matches "${q.trim()}".` }); return; }
    const s = stageOf(c);
    if (!s || s.k !== stepKey) {
      setMsg({ text: `${c.cs} is not in this step. It is at: ${c.stage}.`, link: pathOf(c) });
      return;
    }
    setMsg(null);
    onPick(c.cs);
  };

  return (
    <section className="card p-5">
      <label htmlFor="cs" className="text-sm font-semibold">Case ID</label>
      <p className="mb-2.5 mt-0.5 text-xs text-mute">Type a case number, or pick one of the cases in this step.</p>
      <form className="flex max-w-[720px] gap-2" onSubmit={(e) => { e.preventDefault(); look(); }}>
        <input id="cs" className="input flex-1" value={q} placeholder="PR-SFM-03028" onChange={(e) => setQ(e.target.value)} />
        <Btn type="submit"><Search className="h-4 w-4" />Look up</Btn>
      </form>
      {msg && (
        <p className="mt-2 text-[13px] text-bad-ink">
          {msg.text} {msg.link && <Link to={msg.link}>Open it there</Link>}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-mute">{queue.length ? "In this step, oldest first:" : "No cases are in this step right now."}</span>
        {queue.map((c) => (
          <button key={c.rid} onClick={() => { setMsg(null); onPick(c.cs); }}
            className={cn("inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-semibold text-navy",
              selected?.rid === c.rid ? "border-navy bg-navy-50" : "border-[#cfd6e2] bg-white hover:border-navy")}>
            {c.cs} · {daysOf(c)} d
          </button>
        ))}
      </div>
    </section>
  );
}
