/**
 * The gate in front of every route that touches Quickbase.
 *
 * Two ways in, as in the Permitting Helper:
 *   - Google Workspace sign-in (byrdsonservices.com accounts) — the main one;
 *   - the team password (APP_PASSWORD) — kept as a fallback, and can be removed
 *     from the deployment once Google sign-in is confirmed working.
 *
 * A deployment with a Quickbase token and no way to sign in is refused outright.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { googleConfigured } from "./google-auth.js";
import { open as openIdentity, readCookie } from "./identity.js";

const COOKIE = "pcoc_session";
const TTL_MS = 12 * 60 * 60 * 1000;

const password = () => process.env.APP_PASSWORD?.trim() ?? "";
export const passwordEnabled = () => password() !== "";

export function configured(): boolean {
  return (process.env.QB_USER_TOKEN?.trim() ?? "") !== "" && (passwordEnabled() || googleConfigured());
}

function sameSecret(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a, "utf8").digest();
  const hb = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(ha, hb);
}

const sign = (exp: number) => createHmac("sha256", password()).update(String(exp)).digest("hex");

export function checkPassword(given: string): boolean {
  return passwordEnabled() && typeof given === "string" && given !== "" && sameSecret(given, password());
}

export function sessionCookie(now = Date.now()): string {
  const exp = now + TTL_MS;
  return `${COOKIE}=${exp}.${sign(exp)}; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=${TTL_MS / 1000}`;
}

export function clearCookie(): string {
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=0`;
}

export function hasPasswordSession(req: Request, now = Date.now()): boolean {
  if (!passwordEnabled()) return false;
  const raw = readCookie(req.headers.get("cookie"), COOKIE);
  if (!raw) return false;
  const [expS, mac] = raw.split(".");
  const exp = Number(expS);
  if (!exp || !mac || exp < now) return false;
  return sameSecret(mac, sign(exp));
}

export function hasSession(req: Request): boolean {
  return openIdentity(req) !== null || hasPasswordSession(req);
}

export function json(body: unknown, status = 200, headers: Record<string, string> | Headers = {}): Response {
  const h = new Headers(headers);
  h.set("Content-Type", "application/json");
  h.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(body), { status, headers: h });
}

/**
 * The session cookies are SameSite=None, so a page on another site could make
 * the browser send them. Any request that is not a plain read must therefore
 * come from this app's own origin.
 */
function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // same-origin fetches from older browsers omit it for some methods
  try {
    return new URL(origin).host === new URL(req.url).host;
  } catch {
    return false;
  }
}

/** Null when the caller may proceed; otherwise the Response to send back. */
export function requireSession(req: Request): Response | null {
  if (!configured()) return json({ error: "This deployment is not configured: set QB_USER_TOKEN and a way to sign in (Google or APP_PASSWORD)." }, 503);
  if (!hasSession(req)) return json({ error: "Sign in first." }, 401);
  if (req.method !== "GET" && req.method !== "HEAD" && !sameOrigin(req)) return json({ error: "Cross-site request refused." }, 403);
  return null;
}
