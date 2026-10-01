/**
 * The signed-in person's session (Google Workspace sign-in). SERVER ONLY.
 *
 * Same scheme as the Permitting Helper: a sealed cookie carrying who the
 * person is, HMAC-signed with AUTH_SECRET.
 * It carries no roles: everyone on the domain can do everything here.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE = "pcoc_identity";
export const TTL_HOURS = 12;

export interface Identity {
  sub: string;
  email: string;
  name: string;
  picture?: string;
  iat: number;
  exp: number;
}

/** AUTH_SECRET signs the sessions. Under 32 characters counts as not set. */
function secret(): string {
  const explicit = process.env.AUTH_SECRET?.trim() ?? "";
  return explicit.length >= 32 ? explicit : "";
}
export const secretConfigured = () => secret() !== "";

const b64url = (b: Buffer) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
const sign = (payload: string, key: string) => createHmac("sha256", key).update(payload).digest();
const sameBytes = (a: Buffer, b: Buffer) => a.length === b.length && timingSafeEqual(a, b);

export function newIdentity(input: Omit<Identity, "iat" | "exp">): Identity {
  const now = Math.floor(Date.now() / 1000);
  return { ...input, iat: now, exp: now + TTL_HOURS * 3600 };
}

function seal(identity: Identity): string {
  const payload = b64url(Buffer.from(JSON.stringify(identity), "utf8"));
  return `${payload}.${b64url(sign(payload, secret()))}`;
}

export function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return null;
}

/** The identity in this request, or null when missing, tampered with or expired. */
export function open(request: Request, now = Date.now()): Identity | null {
  const key = secret();
  if (!key) return null;
  const raw = readCookie(request.headers.get("cookie"), COOKIE);
  if (!raw) return null;
  const dot = raw.lastIndexOf(".");
  if (dot < 1) return null;
  try {
    const payload = raw.slice(0, dot);
    if (!sameBytes(sign(payload, key), fromB64url(raw.slice(dot + 1)))) return null;
    const id = JSON.parse(fromB64url(payload).toString("utf8")) as Identity;
    if (!id.exp || id.exp * 1000 <= now || !id.email) return null;
    return id;
  } catch {
    return null;
  }
}

/* SameSite=None so the session also works if the app is embedded in a
   Quickbase dashboard (a different site). Paid for by the Origin check in
   requireSession, which refuses cross-site writes. */
const cookie = (value: string, maxAge: number) =>
  `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=${maxAge}`;

export const issueCookie = (identity: Identity) => cookie(seal(identity), TTL_HOURS * 3600);
export const clearCookie = () => cookie("", 0);

/** Short-lived OAuth state cookie: Lax is right here, it only survives Google's redirect back. */
export function stateCookie(name: string, value: string, maxAge = 600): string {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export function readState(request: Request, name: string): string | null {
  const raw = readCookie(request.headers.get("cookie"), name);
  if (!raw) return null;
  try { return decodeURIComponent(raw); } catch { return null; }
}

/** Only a path on this site — `//evil.example` is another origin. */
export function safeNext(candidate: string | null | undefined, fallback = "/"): string {
  if (!candidate || !candidate.startsWith("/")) return fallback;
  if (candidate.startsWith("//") || candidate.startsWith("/\\")) return fallback;
  return candidate;
}
