import { useEffect, useRef, useState } from "react";
import { Download, Eye, Loader2, X } from "lucide-react";
import { Btn, Pill } from "./ui";
import { type Case, PC, caseFile, downloadUrl, money, view } from "@/lib/engine";
import { cn } from "@/lib/utils";

interface Line { grp: string; desc: string; qty: number | null; unit: string; uc: number | null; rcv: number | null; rev: boolean; kept: boolean; why: string }
interface Scope { file: string; rows: Line[]; total: number; canopyNow: number; atPermit: number; diff: number; cls: string; changes: number }

/**
 * A readable look at the scope file on a case, for any format the app reads
 * (Xactimate PDF, Canopy export, Xactimate Scope Import .xls). Nothing is saved.
 */
export default function ScopePreview({ c, onClose }: { c: Case; onClose: () => void }) {
  const [s, setS] = useState<Scope | null>(null);
  const [err, setErr] = useState("");
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    close.current?.focus();
    PC().readScope(c.rid).then(setS).catch((e: Error) => setErr(e.message));
  }, [c.rid]);
  const isPdf = /\.pdf$/i.test(c.scx || "");
  const kept = s?.rows.filter((r) => r.kept && r.rcv) ?? [];
  const left = s?.rows.filter((r) => !r.kept || !r.rcv) ?? [];

  return (
    <div className="fixed inset-0 z-[9000] flex items-start justify-center overflow-y-auto bg-[rgba(15,23,42,.55)] p-4" role="dialog" aria-modal="true" aria-label="Scope file"
      onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <div className="w-full max-w-5xl rounded-xl bg-white shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h2 className="m-0 text-base font-bold">Scope file · {c.cs}</h2>
            <p className="mt-0.5 break-all text-xs text-mute">{c.scx}</p>
          </div>
          <div className="flex gap-2">
            {isPdf
              ? <Btn kind="outline" onClick={() => view(caseFile(c, 53), `Scope file - ${c.cs}`)}><Eye className="h-4 w-4" />Open the PDF</Btn>
              : <a className="btn border-[#cfd6e2] bg-white text-navy no-underline hover:border-navy" href={downloadUrl(caseFile(c, 53))} download><Download className="h-4 w-4" />Download</a>}
            <Btn ref={close} kind="outline" aria-label="Close" className="w-10 px-0" onClick={onClose}><X className="h-4 w-4" /></Btn>
          </div>
        </div>

        {err && <p className="px-5 py-6 text-sm text-bad-ink">Could not read this file: {err}</p>}
        {!s && !err && <p className="flex items-center gap-2 px-5 py-6 text-sm text-mute"><Loader2 className="h-4 w-4 animate-spin" />Reading the scope file…</p>}
        {s && (
          <>
            <div className="grid grid-cols-1 gap-3 px-5 py-4 md:grid-cols-3">
              <div className="kpi" style={{ borderLeftColor: "#1F3864" }}><div className="kpi-label">Construction total in this file</div><div className="kpi-value">{money(s.total)}</div><div className="text-xs text-mute">{kept.length} lines, without soft costs, taxes and $0 lines</div></div>
              <div className="kpi" style={{ borderLeftColor: "#1F3864" }}><div className="kpi-label">Canopy construction cost now</div><div className="kpi-value">{money(s.canopyNow)}</div><div className="text-xs text-mute">at permit {money(s.atPermit)}</div></div>
              <div className="kpi" style={{ borderLeftColor: s.cls === "CURRENT" ? "#1e7e46" : "#C8102E" }}>
                <div className="kpi-label">Check</div>
                <div className="mt-1">
                  {s.cls === "CURRENT" ? <Pill tone="ok">Matches Canopy</Pill>
                    : s.cls === "PERMIT-TIME" ? <Pill tone="wait">This is the version from the permit</Pill>
                    : <Pill tone="bad">Does not match Canopy</Pill>}
                </div>
                <div className="mt-1 text-xs text-mute">
                  {s.cls === "CURRENT" ? "The Cost Estimate is built from this file."
                    : `Difference ${s.diff > 0 ? "+" : "−"}${money(Math.abs(s.diff))}. Is this the newest scope change for ${c.cs}?`}
                </div>
              </div>
            </div>
            <div className="max-h-[55vh] overflow-auto border-t border-line">
              <table className="w-full border-collapse">
                <thead className="sticky top-0"><tr><th className="th">Group</th><th className="th">Line item</th><th className="th text-right">Qty</th><th className="th text-right">Unit cost</th><th className="th text-right">RCV</th><th className="th">In the estimate</th></tr></thead>
                <tbody>
                  {[...kept, ...left].map((r, i) => (
                    <tr key={i} className={cn(!(r.kept && r.rcv) && "text-mute")}>
                      <td className="td text-xs">{r.grp}</td>
                      <td className="td">{r.desc}</td>
                      <td className="td text-right">{r.qty != null ? Number(r.qty).toLocaleString("en-US", { maximumFractionDigits: 2 }) : ""}{r.unit ? ` ${r.unit}` : ""}</td>
                      <td className="td text-right">{r.uc != null ? money(r.uc) : ""}</td>
                      <td className="td text-right">{r.rcv != null ? money(r.rcv) : ""}</td>
                      <td className="td">{r.kept && r.rcv ? <Pill tone="ok">Yes</Pill> : <Pill>{r.why || "No value ($0)"}</Pill>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
