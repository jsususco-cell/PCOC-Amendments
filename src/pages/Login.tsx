import { useState } from "react";
import { FileCheck2, Lock } from "lucide-react";
import { Btn } from "@/components/ui";

export interface SessionInfo {
  configured: boolean;
  authed: boolean;
  google: boolean;
  password: boolean;
  domain: string;
  user: { email: string; name: string; picture?: string } | null;
}

/** Why Google sign-in came back without a session (?auth=… from /api/auth/callback). */
const REASONS: Record<string, string> = {
  domain: "That Google account is not a Byrdson Services account. Use your @byrdsonservices.com email.",
  cancelled: "Sign-in was cancelled.",
  expired: "The sign-in took too long. Try again.",
  state: "The sign-in could not be verified. Try again.",
  exchange: "Google did not confirm the sign-in. Try again.",
  unconfigured: "Google sign-in is not set up on this deployment yet.",
};

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

export default function Login({ info, onIn }: { info: SessionInfo | null; onIn: () => void }) {
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(() => REASONS[new URLSearchParams(location.search).get("auth") ?? ""] ?? "");
  const google = info?.google ?? false;
  const password = info?.password ?? true;
  const next = location.pathname + location.search.replace(/[?&]auth=[^&]*/, "").replace(/^&/, "?");

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
      <div className="card mx-auto mt-16 max-w-sm p-6">
        <h1 className="m-0 flex items-center gap-2 text-lg font-bold"><Lock className="h-4 w-4" />Sign in</h1>
        {google && (
          <>
            <p className="mb-4 mt-1 text-xs text-mute">Use your {info?.domain ? `@${info.domain}` : "Byrdson"} Google account.</p>
            <a href={`/api/auth/start?next=${encodeURIComponent(next || "/")}`}
              className="btn w-full border-line bg-white text-ink no-underline hover:border-navy hover:text-ink">
              <GoogleMark />Sign in with Google
            </a>
          </>
        )}
        {google && password && (
          <div className="my-4 flex items-center gap-3 text-[11px] uppercase tracking-wider text-mute">
            <span className="h-px flex-1 bg-line" />or the team password<span className="h-px flex-1 bg-line" />
          </div>
        )}
        {password && (
          <form onSubmit={submit}>
            {!google && <p className="mb-4 mt-1 text-xs text-mute">Use the team password.</p>}
            <label className="label">Password
              <input type="password" autoFocus={!google} className="input" value={pw} onChange={(e) => setPw(e.target.value)} />
            </label>
            <Btn type="submit" kind={google ? "outline" : "primary"} busy={busy} className="mt-3 w-full">Sign in with the password</Btn>
          </form>
        )}
        {err && <p className="mt-3 text-[13px] text-bad-ink">{err}</p>}
      </div>
    </div>
  );
}
