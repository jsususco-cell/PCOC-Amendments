import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Copy } from "lucide-react";
import { Btn, Empty, PageTitle, Pill, useAction } from "@/components/ui";
import { PC, W, cases, money, owes, rowsOf, us, useEngine, view } from "@/lib/engine";
import { cn } from "@/lib/utils";

const OUT = ["Paid", "No one available to take payment", "Office closed", "System down", "Documents refused", "Other"];
const PUR = ["Amendment taxes", "Original permit taxes", "Refund claim", "Other"];
const PMETH = ["Company Check", "Credit Card", "Cashier's Check", "ACH / Wire", "Cash", "Money Order", "Paid by PA / Expediter"];
const CARDS = ["Corporate", "Capital One", "Chase 8413", "Chase 0559", "American Express", "1st Financial", "Robinhood", "Chase Ink"];
const localNow = () => new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16);

export default function Trips() {
  useEngine();
  const [sp] = useSearchParams();
  const towns = useMemo(() => Array.from(new Set(cases().map((c) => c.muni).filter(Boolean))).sort(), []);
  const [muni, setMuni] = useState(sp.get("town") ?? "");
  const [time, setTime] = useState(localNow());
  const [who, setWho] = useState<string>(PC().user?.name ?? "");
  const [purpose, setPurpose] = useState(PUR[0]);
  const [outcome, setOutcome] = useState(OUT[0]);
  const [note, setNote] = useState("");
  const [pm, setPm] = useState(PMETH[0]);
  const [card, setCard] = useState("");
  const [pref, setPref] = useState("");
  const [picked, setPicked] = useState<string[]>(() => (sp.get("case") ? [sp.get("case")!] : []));
  const [amts, setAmts] = useState<Record<string, string>>({});
  const [photo, setPhoto] = useState<File | null>(null);
  const [roster, setRoster] = useState<File | null>(null);
  const [receipt, setReceipt] = useState<File | null>(null);
  const [done, setDone] = useState<{ note: string; posted: string[] } | null>(null);
  const { busy, run } = useAction();

  const list = cases().filter((c) => c.muni === muni && ((W.inFlow(c) as boolean) || c.stage === "Finished · confirm with Priscilla"));
  const paid = outcome === "Paid";
  const payRows = paid ? list.filter((c) => picked.includes(c.cs)).flatMap((c) => rowsOf(c).filter((r) => owes(r) || (!Number(r.arb) && (r.adue || r.pdue)))) : [];
  const total = payRows.reduce((t, r) => t + (Number(amts[r.rid]) || 0), 0);

  const toggle = (cs: string) => setPicked((p) => (p.includes(cs) ? p.filter((x) => x !== cs) : [...p, cs]));
  const useFigures = () => setAmts(Object.fromEntries(payRows.map((r) => [r.rid, ((r.adue || 0) + (r.pdue || 0)).toFixed(2)])));

  const save = () => run("save", () => PC().saveTrip({
    muni, time, who, purpose, outcome, note, cases: picked, photo, roster, receipt,
    pay: paid ? { pm, card, pref, rows: payRows.map((r) => ({ rid: r.rid, amt: amts[r.rid] || "" })) } : null,
  }).then((r: { note: string; posted: string[] }) => {
    setDone(r); setPicked([]); setAmts({}); setPhoto(null); setRoster(null); setReceipt(null); setNote("");
    return r;
  }), (r: { posted: string[] }) => paid ? `Trip saved. Paid cases moved to Proof.${r.posted.length ? ` Job cost posted: ${r.posted.join(", ")}.` : ""}` : "Trip saved. Copy the Canopy note below.");

  return (
    <>
      <PageTitle title="Trips to the town" />
      <p className="-mt-3 text-[13px] text-mute">Write down every trip, even when nobody could take the payment. The Program asks for it. When you pay, this one form records the payment on each case and posts the job cost.</p>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1.1fr_1fr]">
        <section className="card flex flex-col gap-3.5 p-5">
          <h2 className="m-0 text-base font-bold">Log a trip</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="label">Which town
              <select className="input" value={muni} onChange={(e) => { setMuni(e.target.value); setPicked([]); }}>
                <option value=""></option>{towns.map((t) => <option key={t}>{t}</option>)}
              </select>
            </label>
            <label className="label">Date and time<input type="datetime-local" className="input" value={time} onChange={(e) => setTime(e.target.value)} /></label>
            <label className="label">Who went<input className="input" value={who} onChange={(e) => setWho(e.target.value)} placeholder="name" /></label>
            <label className="label">Why you went<select className="input" value={purpose} onChange={(e) => setPurpose(e.target.value)}>{PUR.map((x) => <option key={x}>{x}</option>)}</select></label>
            <label className="label">What happened<select className="input" value={outcome} onChange={(e) => setOutcome(e.target.value)}>{OUT.map((x) => <option key={x}>{x}</option>)}</select></label>
            {paid && <label className="label">How paid<select className="input" value={pm} onChange={(e) => setPm(e.target.value)}>{PMETH.map((x) => <option key={x}>{x}</option>)}</select></label>}
            {paid && pm === "Credit Card" && <label className="label">Which card<select className="input" value={card} onChange={(e) => setCard(e.target.value)}><option value=""></option>{CARDS.map((x) => <option key={x}>{x}</option>)}</select></label>}
            {paid && <label className="label">Check no. / last 4 / confirmation<input className="input" value={pref} onChange={(e) => setPref(e.target.value)} /></label>}
          </div>

          <div>
            <div className="kpi-label">Tick every case you went for</div>
            {!muni ? <p className="text-xs text-mute">Pick the town first. Its cases show here.</p> : list.length === 0 ? <p className="text-xs text-mute">No open case in {muni}.</p> : (
              <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
                {list.map((c) => (
                  <label key={c.rid} className="flex min-h-[32px] items-center gap-1.5 text-[13px]">
                    <input type="checkbox" checked={picked.includes(c.cs)} onChange={() => toggle(c.cs)} />
                    {c.cs} <span className="text-xs text-mute">{c.stage}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {paid && payRows.length > 0 && (
            <div>
              <div className="flex items-center justify-between">
                <div className="kpi-label">What the town charged, per scope change</div>
                <button className="text-xs font-semibold text-navy" onClick={useFigures}>Use our figures</button>
              </div>
              {payRows.map((r) => (
                <div key={r.rid} className="grid grid-cols-[minmax(0,1fr)_130px] items-center gap-2.5 border-t border-[#eef1f6] py-2">
                  <span className="text-[13px]"><b>{r.cs}</b> {r.sc} <span className="text-xs text-mute">our figure {money((r.adue || 0) + (r.pdue || 0))}</span></span>
                  <input className="input text-right" inputMode="decimal" aria-label={`Paid for ${r.cs} ${r.sc}`} placeholder="not paid" value={amts[r.rid] ?? ""}
                    onChange={(e) => setAmts((a) => ({ ...a, [r.rid]: e.target.value }))} />
                </div>
              ))}
              <div className="border-t border-[#eef1f6] pt-2 text-right text-[13px]">Total <b>{money(total)}</b></div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            {([["Photo with date and time", photo, setPhoto], ["Sign-in sheet", roster, setRoster], ["Receipt", receipt, setReceipt]] as const).map(([l, f, set]) => (
              <label key={l} className={cn("flex min-h-[44px] cursor-pointer flex-col items-center justify-center rounded-[10px] border-[1.5px] border-dashed px-3 py-2 text-center text-[12.5px] font-semibold",
                f ? "border-ok bg-ok-bg text-ok-ink" : "border-[#cfd6e2] bg-[#fafbfd] text-navy hover:border-navy")}>
                {f ? f.name : l}
                <input type="file" accept="image/*,.pdf" className="hidden" onChange={(e) => (set as (x: File | null) => void)(e.target.files?.[0] ?? null)} />
              </label>
            ))}
          </div>
          <label className="label">Note<textarea rows={2} className="input h-auto py-2" placeholder="Who did you talk to? What did they say?" value={note} onChange={(e) => setNote(e.target.value)} /></label>
          <div className="flex flex-wrap items-center gap-3">
            <Btn kind="go" busy={busy === "save"} onClick={save}>Save this trip</Btn>
            <span className="text-xs text-mute">{paid ? <>Paid cases move to <b>4 · Proof to the PA</b>.</> : "The Canopy note is written for you."}</span>
          </div>
          {done && (
            <div className="rounded-lg border border-[#c4e3d0] bg-[#eef6f1] p-3 text-[13px]">
              <div className="kpi-label mb-1">Note for Canopy</div>
              <p className="m-0">{done.note}</p>
              <Btn className="mt-2" kind="outline" onClick={() => navigator.clipboard?.writeText(done.note)}><Copy className="h-4 w-4" />Copy</Btn>
            </div>
          )}
        </section>
        <RecentTrips />
      </div>
    </>
  );
}

function RecentTrips() {
  const visits: Record<string, string>[] = W.G?.visits ?? [];
  const { busy, run } = useAction();
  const vt = "bwdpne6tg";
  return (
    <section className="card">
      <div className="border-b border-line px-4 py-3.5"><h2 className="m-0 text-base font-bold">Recent trips</h2><div className="text-xs text-mute">The last 60, newest first.</div></div>
      {visits.length === 0 ? <Empty>No trips logged yet.</Empty> : visits.map((v) => (
        <div key={v.rid} className="flex flex-col gap-2 border-b border-[#eef1f6] px-4 py-3.5">
          <div className="flex flex-wrap justify-between gap-2">
            <b>{v["7"]} · {W.vdt(v["6"])}</b>
            <Pill tone={v["11"] === "Paid" ? "ok" : "bad"}>{v["11"]}{Number(v["12"]) ? ` ${money(Number(v["12"]))}` : ""}</Pill>
          </div>
          <div className="text-xs text-mute">
            {[v["8"], v["10"]].filter(Boolean).join(" · ")}
            {[["13", "photo"], ["14", "sign-in sheet"], ["15", "receipt"]].filter(([f]) => v[f]).map(([f, l]) => (
              <button key={f} className="ml-2 font-semibold text-navy underline" onClick={() => view(`/up/${vt}/a/r${v.rid}/e${f}/v0`, `${l} - ${v["7"]}`)}>{l}</button>
            ))}
          </div>
          {v["17"] && <div className="rounded-lg border border-[#eef1f6] bg-[#fafbfd] p-2.5 text-[12.5px] leading-relaxed">{v["17"]}</div>}
          <div className="flex flex-wrap gap-2">
            <Btn kind="outline" onClick={() => navigator.clipboard?.writeText(v["17"] || "")}><Copy className="h-4 w-4" />Copy the Canopy note</Btn>
            {v["18"] ? <Pill tone="ok">Pasted in Canopy {us(W.day(v["18"]))}{v["19"] ? ` by ${v["19"]}` : ""}</Pill>
              : <Btn kind="outline" busy={busy === v.rid} onClick={() => run(v.rid, () => PC().markPasted(v.rid, PC().user?.name ?? ""), "Marked as pasted in Canopy.")}>I pasted it in Canopy</Btn>}
          </div>
        </div>
      ))}
    </section>
  );
}
