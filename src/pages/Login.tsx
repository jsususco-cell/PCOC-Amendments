import { useState } from "react";
import { FileCheck2, Lock } from "lucide-react";
import { Btn } from "@/components/ui";

export default function Login({ onIn }: { onIn: () => void }) {
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const r = await fetch("/api/session", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: pw }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not sign in.");
      onIn();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen">
      <header className="byrdson-top">
        <div className="mx-auto flex h-16 max-w-[1216px] items-center gap-3 px-8">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10"><FileCheck2 className="h-5 w-5" /></span>
          <span>
            <span className="block text-base font-bold leading-none">PCOC Amendments</span>
            <span className="mt-1 block text-[10px] uppercase tracking-[0.18em] opacity-80">Byrdson Services · Puerto Rico</span>
          </span>
        </div>
      </header>
      <form onSubmit={submit} className="card mx-auto mt-16 max-w-sm p-6">
        <h1 className="m-0 flex items-center gap-2 text-lg font-bold"><Lock className="h-4 w-4" />Sign in</h1>
        <p className="mb-4 mt-1 text-xs text-mute">Use the team password.</p>
        <label className="label">Password
          <input type="password" autoFocus className="input" value={pw} onChange={(e) => setPw(e.target.value)} />
        </label>
        {err && <p className="mt-2 text-[13px] text-bad-ink">{err}</p>}
        <Btn type="submit" busy={busy} className="mt-4 w-full">Sign in</Btn>
      </form>
    </div>
  );
}
