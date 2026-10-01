/**
 * Google Workspace sign-in. SERVER ONLY.
 *
 * Ported from the ERP (src/lib/auth/google.ts) so the two apps behave the same
 * way and can share one OAuth client. Deliberately not a framework auth
 * library: the flow is a hundred lines, and an authentication dependency that
 * breaks on a minor upgrade is worse than one that can be read in full.
 *
 * What this replaces is a single shared password. That password was one secret
 * for everyone, could not say who did anything, and had to be changed for the
 * whole office when one person left. A Workspace account is per person and is
 * revoked by disabling the account.
 */

import { createRemoteJWKSet, jwtVerify } from "jose";

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

/** Carries the state and PKCE verifier between /start and /callback. */
export const STATE_COOKIE = "pcoc_oauth";

export function allowedDomain(): string {
  return (process.env.AUTH_ALLOWED_DOMAIN?.trim() || "byrdsonservices.com").toLowerCase();
}

export function clientId(): string {
  return process.env.GOOGLE_CLIENT_ID?.trim() ?? "";
}

function clientSecret(): string {
  return process.env.GOOGLE_CLIENT_SECRET?.trim() ?? "";
}

/** Whether this deployment can offer Google sign-in at all. */
export function googleConfigured(): boolean {
  return clientId() !== "" && clientSecret() !== "";
}

/**
 * Where Google sends people back.
 *
 * A clean path with no query string, because `api/session.ts` is reached
 * through a rewrite in vercel.json rather than being its own function — this
 * project is at Vercel's twelve-function limit. Google also matches redirect
 * URIs exactly, so the registered value and this one have to agree character
 * for character.
 */
export function redirectUri(origin: string): string {
  const base = (process.env.APP_BASE_URL?.trim() || origin).replace(/\/$/, "");
  return `${base}/api/auth/callback`;
}

export interface GoogleIdentity {
  /** Google subject id — stable even if the person changes their name. */
  sub: string;
  email: string;
  name: string;
  picture?: string;
  hd?: string;
  emailVerified: boolean;
}

/** Random URL-safe string for the state and the PKCE verifier. */
export function randomToken(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  let bin = "";
  for (const b of new Uint8Array(digest)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function authorizeUrl(opts: { state: string; codeChallenge: string; origin: string }): string {
  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri(opts.origin),
    response_type: "code",
    scope: "openid email profile",
    state: opts.state,
    code_challenge: opts.codeChallenge,
    code_challenge_method: "S256",
    // Asks Google to show only Workspace accounts on this domain. It is a hint
    // to the account chooser, NOT a security control — the callback still
    // checks the domain itself.
    hd: allowedDomain(),
    prompt: "select_account",
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

export async function exchangeCode(
  code: string,
  codeVerifier: string,
  origin: string,
): Promise<GoogleIdentity> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId(),
      client_secret: clientSecret(),
      redirect_uri: redirectUri(origin),
      grant_type: "authorization_code",
      code_verifier: codeVerifier,
    }),
    // No `cache: "no-store"` — this project's fetch types are Node's, which do
    // not carry it, and a POST is not cached anyway.
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(`Google rejected the sign-in code exchange: ${detail.slice(0, 300)}`);
  }

  const body = (await res.json()) as { id_token?: string };
  if (!body.id_token) throw new Error("Google returned no id_token, so there is no identity to trust.");

  const { payload } = await jwtVerify(body.id_token, JWKS, {
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    audience: clientId(),
  });

  const email = String(payload.email ?? "").toLowerCase();
  if (!email) throw new Error("Google returned an identity with no email address.");

  return {
    sub: String(payload.sub),
    email,
    name: String(payload.name ?? email),
    picture: payload.picture ? String(payload.picture) : undefined,
    hd: payload.hd ? String(payload.hd).toLowerCase() : undefined,
    emailVerified: payload.email_verified === true,
  };
}

/**
 * The domain gate.
 *
 * Google's `hd` parameter only filters the account chooser, so this is where a
 * personal account that knows the callback URL is actually turned away.
 */
export function isAllowedIdentity(identity: GoogleIdentity): boolean {
  if (!identity.emailVerified) return false;
  const domain = identity.hd ?? identity.email.split("@")[1] ?? "";
  return domain === allowedDomain();
}
