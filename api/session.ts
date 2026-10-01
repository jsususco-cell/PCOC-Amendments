/**
 * Signing in — Google Workspace only.
 *
 *   GET    /api/session        who is signed in
 *   DELETE /api/session        signs out
 *
 *   GET    /api/auth/start     begins Google sign-in          (rewrite → ?action=start)
 *   GET    /api/auth/callback  where Google sends people back (rewrite → ?action=callback)
 *   GET    /api/auth/signout   signs out and returns to the app
 *
 * Google matches redirect URIs character for character, so the registered URI
 * is the clean /api/auth/callback path (see vercel.json rewrites).
 */
import { configured, json } from "./_lib/auth.js";
import {
  STATE_COOKIE, allowedDomain, authorizeUrl, exchangeCode, googleConfigured, isAllowedIdentity, pkceChallenge, randomToken,
} from "./_lib/google-auth.js";
import { clearCookie, issueCookie, newIdentity, open as openIdentity, readState, safeNext, stateCookie } from "./_lib/identity.js";

function redirect(to: string, cookies: string[] = []): Response {
  const headers = new Headers({ Location: to, "Cache-Control": "no-store" });
  for (const c of cookies) headers.append("Set-Cookie", c);
  return new Response(null, { status: 302, headers });
}

const refuse = (reason: string) => redirect(`/?auth=${encodeURIComponent(reason)}`, [stateCookie(STATE_COOKIE, "", 0)]);

async function start(req: Request): Promise<Response> {
  const url = new URL(req.url);
  if (!configured()) return redirect("/?auth=unconfigured");
  const next = safeNext(url.searchParams.get("next"));
  const state = randomToken();
  const verifier = randomToken(48);
  return redirect(
    authorizeUrl({ state, codeChallenge: await pkceChallenge(verifier), origin: url.origin }),
    [stateCookie(STATE_COOKIE, JSON.stringify({ state, verifier, next }))],
  );
}

async function callback(req: Request): Promise<Response> {
  const url = new URL(req.url);
  if (url.searchParams.get("error")) return refuse("cancelled");
  const raw = readState(req, STATE_COOKIE);
  if (!raw) return refuse("expired");
  let stored: { state: string; verifier: string; next: string };
  try { stored = JSON.parse(raw); } catch { return refuse("expired"); }
  const code = url.searchParams.get("code");
  if (!code || url.searchParams.get("state") !== stored.state) return refuse("state");

  let identity;
  try {
    identity = await exchangeCode(code, stored.verifier, url.origin);
  } catch (err) {
    console.error("[auth] code exchange failed:", (err as Error).message);
    return refuse("exchange");
  }
  // Google's hd only filters the account chooser; this is the real domain gate.
  if (!isAllowedIdentity(identity)) return refuse("domain");

  return redirect(safeNext(stored.next), [
    issueCookie(newIdentity({ sub: identity.sub, email: identity.email, name: identity.name, picture: identity.picture })),
    stateCookie(STATE_COOKIE, "", 0),
  ]);
}

export async function GET(req: Request): Promise<Response> {
  const action = new URL(req.url).searchParams.get("action");
  if (action === "start") return start(req);
  if (action === "callback") return callback(req);
  if (action === "signout") return redirect("/", [clearCookie()]);

  const id = openIdentity(req);
  return json({
    configured: configured(),
    authed: id !== null,
    google: googleConfigured(),
    domain: allowedDomain(),
    user: id ? { email: id.email, name: id.name, picture: id.picture } : null,
  });
}

export async function DELETE(): Promise<Response> {
  return json({ authed: false }, 200, { "Set-Cookie": clearCookie() });
}
