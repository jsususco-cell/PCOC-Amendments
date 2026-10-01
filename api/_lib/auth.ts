/**
 * Password gate in front of every route that touches Quickbase.
 *
 * Same scheme as the Permitting Helper: no session store. The cookie carries
 * its own expiry and an HMAC over it keyed by APP_PASSWORD, so changing the
 * password signs everyone out.
 *
 * A deployment with a Quickbase token and no password is refused outright —
 * a full-privilege token behind an open URL is the one thing this must not be.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const COOKIE = "pcoc_session";
const TTL_MS = 12 * 60 * 60 * 1000;

const password = () => process.env.APP_PASSWORD?.trim() ?? "";

export function configured(): boolean {
  return password() !== "" && (process.env.QB_USER_TOKEN?.trim() ?? "") !== "";
}

function sameSecret(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a, "utf8").digest();
  const hb = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(ha, hb);
}

function sign(exp: number): string {
  return createHmac("sha256", password()).update(String(exp)).digest("hex");
}

export function checkPassword(given: string): boolean {
  return password() !== "" && sameSecret(given ?? "", password());
}

export function sessionCookie(now = Date.now()): string {
  const exp = now + TTL_MS;
  return `${COOKIE}=${exp}.${sign(exp)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${TTL_MS / 1000}`;
}

export function clearCookie(): string {
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export function hasSession(req: Request, now = Date.now()): boolean {
  if (!password()) return false;
  const raw = req.headers.get("cookie") ?? "";
  const m = raw.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  if (!m) return false;
  const [expS, mac] = m[1].split(".");
  const exp = Number(expS);
  if (!exp || !mac || exp < now) return false;
  return sameSecret(mac, sign(exp));
}

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers },
  });
}

/** Null when the caller may proceed; otherwise the Response to send back. */
export function requireSession(req: Request): Response | null {
  if (!configured()) return json({ error: "This deployment is not configured: set APP_PASSWORD and QB_USER_TOKEN." }, 503);
  if (!hasSession(req)) return json({ error: "Sign in first." }, 401);
  return null;
}
