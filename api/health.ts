import { configured, json } from "./_lib/auth.js";

/** Unauthenticated liveness check. Says whether the deployment is configured, nothing more. */
export async function GET(): Promise<Response> {
  return json({ ok: true, configured: configured() });
}
