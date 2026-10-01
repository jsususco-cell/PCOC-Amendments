import { ChevronRight, FileCheck2, Loader2 } from "lucide-react";
import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import { PARKED, STEPS, cases, inStep, useEngine } from "@/lib/engine";

const TOOLS = [
  { to: "/trips", label: "Trips" },
  { to: "/payments", label: "Payments" },
  { to: "/emails", label: "Emails" },
  { to: "/rates", label: "Rates" },
];

/** The navy bar with the red rule, then the process rail: Board, Intake, Steps 1–5. */
export default function Header({ busy, onSignOut }: { busy: string; onSignOut: () => void }) {
  useEngine();
  const all = cases();
  const parked = all.filter((c) => PARKED.includes(c.stage)).length;
  const rail = [
    { to: "/", label: "Board", n: "", count: all.length },
    { to: "/intake", label: "Intake", n: "", count: parked },
    ...STEPS.map((s) => ({ to: s.path, label: s.label, n: s.num, count: inStep(s.k).length })),
  ];

  return (
    <div className="sticky top-0 z-50">
      <header className="byrdson-top">
        <div className="mx-auto flex h-16 max-w-[1216px] items-center justify-between gap-4 px-4 sm:px-8">
          <NavLink to="/" className="flex items-center gap-3 text-white no-underline hover:text-white">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10"><FileCheck2 className="h-5 w-5" /></span>
            <span>
              <span className="block text-base font-bold leading-none">PCOC Amendments</span>
              <span className="mt-1 hidden text-[10px] uppercase tracking-[0.18em] opacity-80 sm:block">Byrdson Services · Puerto Rico</span>
            </span>
          </NavLink>
          <nav aria-label="Tools" className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 sm:gap-x-5">
            {TOOLS.map((t) => (
              <NavLink key={t.to} to={t.to}
                className={({ isActive }) => cn("border-b-2 pb-0.5 text-[11px] font-semibold uppercase tracking-widest text-white no-underline hover:text-white",
                  isActive ? "border-brand opacity-100" : "border-transparent opacity-70 hover:opacity-100")}>
                {t.label}
              </NavLink>
            ))}
            <button onClick={onSignOut} className="text-[11px] font-semibold uppercase tracking-widest text-white opacity-60 hover:opacity-100">Sign out</button>
          </nav>
        </div>
      </header>
      <div className="border-b border-line bg-white">
        <nav aria-label="Process steps" className="mx-auto flex h-12 max-w-[1216px] items-stretch gap-1 overflow-x-auto px-4 sm:px-8">
          {rail.map((t, i) => (
            <div key={t.to} className="flex items-stretch">
              {i > 2 && (
                <span className="flex items-center text-[#b4bccb]" aria-hidden><ChevronRight className="h-3.5 w-3.5" /></span>
              )}
              <NavLink to={t.to} end={t.to === "/"}
                className={({ isActive }) => cn("flex items-center gap-2 whitespace-nowrap border-b-2 px-3 text-[13px] no-underline",
                  isActive ? "border-brand font-bold text-navy" : "border-transparent font-medium text-mute hover:text-navy")}>
                {({ isActive }) => (
                  <>
                    {t.n && (
                      <span className={cn("inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold",
                        isActive ? "bg-navy text-white" : "bg-[#eef1f6] text-[#475066]")}>{t.n}</span>
                    )}
                    <span>{t.label}</span>
                    <span className={cn("min-w-[22px] rounded-full px-1.5 py-px text-center text-[11px] font-bold tnum",
                      isActive ? "bg-bad-bg text-[#a30d26]" : "bg-[#eef1f6] text-[#475066]")}>{t.count}</span>
                  </>
                )}
              </NavLink>
            </div>
          ))}
        </nav>
      </div>
      {busy && (
        <div className="border-b border-[#f1d58a] bg-[#fff8e6] px-4 py-1.5 text-center text-xs text-warn-ink">
          <Loader2 className="mr-1.5 inline h-3.5 w-3.5 animate-spin" />{busy}
        </div>
      )}
    </div>
  );
}
