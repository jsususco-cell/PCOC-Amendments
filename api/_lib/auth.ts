/**
 * The gate in front of every route that touches Quickbase.
 *
 * The only way in is Google Workspace sign-in (byrdsonservices.com accounts),
 * the same flow as the Permitting Helper. There is no shared password.
 *
 * A deployment with a Quickbase token and no sign-in configured is refused outright.
 */
import { googleConfigured } from "./google-auth.js";
import { open as openIdentity, secretConfigured } from "./identity.js";

export function configured(): boolean {
  return (process.env.QB_USER_TOKEN?.trim() ?? "") !== "" && googleConfigured() && secretConfigured();
}

export function hasSession(req: Request): boolean {
  return openIdentity(req) !== null;
}

export function json(body: unknown, status = 200, headers: Record<string, string> | Headers = {}): Response {
  const h = new Headers(headers);
  h.set("Content-Type", "application/json");
  h.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(body), { status, headers: h });
}

/**
 * The session cookie is SameSite=None, so a page on another site could make
 * the browser send it. Any request that is not a plain read must therefore
 * come from this app's own origin.
 */
function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(req.url).host;
  } catch {
    return false;
  }
}

/** Null when the caller may proceed; otherwise the Response to send back. */
export function requireSession(req: Request): Response | null {
  if (!configured()) return json({ error: "This deployment is not configured: set QB_USER_TOKEN, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and AUTH_SECRET." }, 503);
  if (!hasSession(req)) return json({ error: "Sign in first." }, 401);
  if (req.method !== "GET" && req.method !== "HEAD" && !sameOrigin(req)) return json({ error: "Cross-site request refused." }, 403);
  return null;
}
