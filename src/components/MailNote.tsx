import { type Case, KIND, lastMail, us } from "@/lib/engine";

/** One line saying what happened to the last email of this kind for the case. */
export default function MailNote({ c, kind }: { c: Case; kind: keyof ReturnType<typeof KIND> | string }) {
  const k = KIND()[kind as string] ?? kind;
  const m = lastMail(c, k);
  if (!m) return null;
  const t = m.st === "Sent" ? `Email sent ${us(m.sent || m.created)}`
    : m.st === "Draft" ? `Draft saved ${us(m.created)}, not sent (emails held)`
    : m.st === "Queued" ? "Email is going out now"
    : m.st === "Failed" ? "Email did not go out" : m.st;
  return <div className={m.st === "Sent" ? "text-[11.5px] text-ok-ink" : m.st === "Failed" ? "text-[11.5px] text-bad-ink" : "text-[11.5px] text-mute"}>{t}</div>;
}

export const mailToast = (st: string) =>
  st === "Draft" ? "Saved as a draft in the Outbox. Emails are held, so nothing was sent." : "Queued in the Outbox. It goes out in a moment.";
