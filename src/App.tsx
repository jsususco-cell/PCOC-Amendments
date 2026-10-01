import { useCallback, useEffect, useState } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster, toast } from "sonner";
import { Loader2 } from "lucide-react";
import Header from "@/components/Header";
import Login, { type SessionInfo } from "@/pages/Login";
import Board from "@/pages/Board";
import Intake from "@/pages/Intake";
import Prepare from "@/pages/Prepare";
import WithPA from "@/pages/WithPA";
import PayTown from "@/pages/PayTown";
import Proof from "@/pages/Proof";
import Close from "@/pages/Close";
import Trips from "@/pages/Trips";
import Payments from "@/pages/Payments";
import Emails from "@/pages/Emails";
import Rates from "@/pages/Rates";
import { PC } from "@/lib/engine";

type Auth = "checking" | "out" | "in" | "unconfigured";

export default function App() {
  const [auth, setAuth] = useState<Auth>("checking");
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [info, setInfo] = useState<SessionInfo | null>(null);

  const check = useCallback(() => {
    fetch("/api/session", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((j: SessionInfo) => {
        setInfo(j);
        PC().user = j.user;
        setAuth(!j.configured ? "unconfigured" : j.authed ? "in" : "out");
        if (j.authed && /[?&]auth=/.test(location.search)) history.replaceState(null, "", location.pathname);
      })
      .catch(() => setAuth("out"));
  }, []);
  useEffect(() => { check(); }, [check]);

  useEffect(() => {
    const offs = [
      PC().on("toast", (m: string) => toast(m)),
      PC().on("error", (m: string) => setErr(m)),
      PC().on("busy", (m: string) => setBusy(m || "")),
      PC().on("auth", () => setAuth("out")),
    ];
    return () => offs.forEach((f: () => void) => f());
  }, []);

  useEffect(() => {
    if (auth !== "in") return;
    setErr("");
    PC().loadAll().then(() => {
      setLoaded(true);
      if (PC().upkeepDue()) PC().upkeep();
    });
  }, [auth]);

  const signOut = useCallback(() => {
    fetch("/api/session", { method: "DELETE", credentials: "same-origin" }).finally(() => { setLoaded(false); setAuth("out"); });
  }, []);

  if (auth === "checking") return <Splash text="Opening…" />;
  if (auth === "unconfigured") return <Splash text="This deployment is not set up yet: QB_USER_TOKEN, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and AUTH_SECRET must be set in Vercel." />;
  if (auth === "out") return <><Login info={info} /><Toaster richColors position="bottom-right" /></>;

  return (
    <BrowserRouter>
      <Header busy={busy} onSignOut={signOut} user={info?.user ?? null} />
      <main className="mx-auto flex max-w-[1216px] flex-col gap-5 px-4 pb-12 pt-7 sm:px-8">
        {err && <div className="rounded-xl border border-[#f2c4bd] bg-bad-bg px-4 py-3 text-[13px] text-bad-ink"><b>Could not load everything.</b> {err}</div>}
        {!loaded ? (
          <p className="flex items-center gap-2 py-10 text-sm text-mute"><Loader2 className="h-4 w-4 animate-spin" />Loading the amendments from Quickbase…</p>
        ) : (
          <Routes>
            <Route path="/" element={<Board />} />
            <Route path="/intake" element={<Intake />} />
            <Route path="/prepare" element={<Prepare />} />
            <Route path="/with-pa" element={<WithPA />} />
            <Route path="/pay" element={<PayTown />} />
            <Route path="/proof" element={<Proof />} />
            <Route path="/close" element={<Close />} />
            <Route path="/trips" element={<Trips />} />
            <Route path="/payments" element={<Payments />} />
            <Route path="/emails" element={<Emails />} />
            <Route path="/rates" element={<Rates />} />
            <Route path="*" element={<Board />} />
          </Routes>
        )}
      </main>
      <Toaster richColors position="bottom-right" />
    </BrowserRouter>
  );
}

function Splash({ text }: { text: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <p className="max-w-md text-center text-sm text-mute">{text}</p>
    </div>
  );
}
