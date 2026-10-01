import React, { useEffect, useRef, useState } from "react";
import { Check, Clock, Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Tone = "ok" | "wait" | "bad" | "navy" | "grey";
const PILL: Record<Tone, string> = {
  ok: "bg-ok-bg text-ok-ink",
  wait: "bg-warn-bg text-warn-ink",
  bad: "bg-bad-bg text-bad-ink",
  navy: "bg-navy-50 text-navy",
  grey: "bg-[#eef1f6] text-[#475066]",
};
export function Pill({ tone = "grey", children, title }: { tone?: Tone; children: React.ReactNode; title?: string }) {
  return <span className={cn("pill", PILL[tone])} title={title}>{children}</span>;
}

type BtnKind = "primary" | "outline" | "go" | "danger";
const BTN: Record<BtnKind, string> = {
  primary: "border-navy bg-navy text-white hover:bg-navy-light",
  outline: "border-[#cfd6e2] bg-white text-navy hover:border-navy",
  go: "border-ok bg-ok text-white hover:brightness-110",
  danger: "border-brand bg-brand text-white hover:bg-brand-dark",
};
export const Btn = React.forwardRef<HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { kind?: BtnKind; busy?: boolean }>(
  function Btn({ kind = "primary", busy, className, children, type = "button", ...p }, ref) {
    return (
      <button ref={ref} type={type} {...p} disabled={p.disabled || busy} className={cn("btn", BTN[kind], className)}>
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        {children}
      </button>
    );
  });

/** Runs an async action with a spinner and turns errors into a message. */
export function useAction() {
  const [busy, setBusy] = useState<string | null>(null);
  const run = async <T,>(key: string, fn: () => Promise<T>, ok?: string | ((v: T) => string)): Promise<T | undefined> => {
    setBusy(key);
    try {
      const v = await fn();
      if (ok) toast.success(typeof ok === "function" ? ok(v) : ok);
      return v;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
      return undefined;
    } finally {
      setBusy(null);
    }
  };
  return { busy, run };
}

export function Kpi({ label, value, sub, edge = "#dfe4ec" }: { label: string; value: React.ReactNode; sub?: React.ReactNode; edge?: string }) {
  return (
    <div className="kpi" style={{ borderLeftColor: edge }}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {sub != null && <div className="text-xs text-mute">{sub}</div>}
    </div>
  );
}
export const EDGE = { navy: "#1F3864", red: "#C8102E", amber: "#b7791f", green: "#1e7e46" };

export function PageTitle({ title, who, ends, children }: { title: string; who?: string; ends?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="m-0 text-2xl font-bold tracking-tight">{title}</h1>
        {(who || ends) && (
          <p className="mt-1 text-[13px] text-mute">
            {who && <><b className="text-ink">Who:</b> {who}</>}
            {who && ends && " · "}
            {ends && <><b className="text-ink">Ends when:</b> {ends}</>}
          </p>
        )}
      </div>
      {children}
    </div>
  );
}

export function StatusIcon({ state }: { state: "ok" | "wait" | "no" }) {
  const c = state === "ok" ? "bg-ok-bg text-ok" : state === "wait" ? "bg-warn-bg text-warn" : "bg-bad-bg text-bad";
  return (
    <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full", c)}>
      {state === "ok" ? <Check className="h-4 w-4" strokeWidth={2.6} /> : state === "wait" ? <Clock className="h-4 w-4" /> : <X className="h-4 w-4" strokeWidth={2.6} />}
    </span>
  );
}

/** One checklist row: icon, name + detail, status pill, actions. */
export function DocRow({ state, name, detail, pill, children }:
  { state: "ok" | "wait" | "no"; name: React.ReactNode; detail?: React.ReactNode; pill?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[32px_minmax(0,1fr)] items-center gap-3.5 border-t border-[#eef1f6] px-5 py-3.5 md:grid-cols-[32px_minmax(0,1fr)_auto_auto]">
      <StatusIcon state={state} />
      <div>
        <div className="text-sm font-semibold">{name}</div>
        {detail && <div className="text-xs text-mute">{detail}</div>}
      </div>
      <div className="col-start-2 md:col-start-auto">{pill}</div>
      <div className="col-start-2 flex flex-wrap gap-1.5 md:col-start-auto">{children}</div>
    </div>
  );
}

/** A button that opens the file picker and hands back the chosen file. */
export function FileBtn({ label = "Upload", accept, onFile, busy, kind = "outline" }:
  { label?: string; accept?: string; onFile: (f: File) => void; busy?: boolean; kind?: BtnKind }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input ref={ref} type="file" accept={accept} className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
      <Btn kind={kind} busy={busy} onClick={() => ref.current?.click()}><Upload className="h-4 w-4" />{label}</Btn>
    </>
  );
}

export function DateField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="label">
      {label}
      <span className="flex items-center gap-1.5">
        <input type="date" className="input" value={value || ""} onChange={(e) => onChange(e.target.value)} />
        {!value && (
          <button type="button" className="text-xs font-semibold text-navy hover:text-brand"
            onClick={() => onChange(new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10))}>
            today
          </button>
        )}
      </span>
    </label>
  );
}

export function TextField({ label, value, onChange, placeholder, className }:
  { label: string; value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <label className={cn("label", className)}>
      {label}
      <input className="input" value={value || ""} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

export function NextBox({ children }: { children: React.ReactNode }) {
  return <div className="next"><b>Next thing to do:</b> {children}</div>;
}

export function ActionBar({ children, note }: { children: React.ReactNode; note?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-b-xl border-t border-line bg-[#fafbfd] px-5 py-3.5">
      {children}
      {note && <span className="ml-auto text-xs text-mute">{note}</span>}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="px-4 py-6 text-[13px] text-mute">{children}</div>;
}

/** In-page confirm. Focus lands on Cancel, never on the action. */
export function Confirm({ open, title, body, action, danger, onCancel, onOk }:
  { open: boolean; title: string; body: React.ReactNode; action: string; danger?: boolean; onCancel: () => void; onOk: () => void }) {
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (open) cancel.current?.focus(); }, [open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[9000] flex items-center justify-center bg-[rgba(15,23,42,.55)] p-4" role="dialog" aria-modal="true" aria-label={title}
      onKeyDown={(e) => e.key === "Escape" && onCancel()}>
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
        <h2 className="m-0 text-base font-bold">{title}</h2>
        <div className="mt-2 text-sm text-ink">{body}</div>
        <div className="mt-5 flex justify-end gap-2">
          <Btn ref={cancel} kind="outline" onClick={onCancel}>Cancel</Btn>
          <Btn kind={danger ? "danger" : "primary"} onClick={onOk}>{action}</Btn>
        </div>
      </div>
    </div>
  );
}

export function HeldBanner() {
  return (
    <div className="rounded-xl border border-[#f2c4bd] bg-bad-bg px-4 py-2.5 text-[13px]">
      <b className="text-bad-ink">Emails are held.</b> Pressing an email button saves a draft in the Outbox. Nothing goes out until emails are released in Quickbase (KTO Program Defaults). Until then, send anything urgent yourself.
    </div>
  );
}
