import { useSearchParams } from "react-router-dom";
import { type Case, cases } from "./engine";

/** The case in ?case=, else the oldest one in the step's queue. */
export function useSelectedCase(queue: Case[]): [Case | null, (cs: string) => void] {
  const [sp, setSp] = useSearchParams();
  const want = sp.get("case");
  const c = (want && cases().find((x) => x.cs === want)) || queue[0] || null;
  const pick = (cs: string) => setSp((p) => { p.set("case", cs); return p; }, { replace: true });
  return [c, pick];
}
