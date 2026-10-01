import { checkPassword, clearCookie, configured, hasSession, json, sessionCookie } from "./_lib/auth.js";

/** GET: am I signed in? POST {password}: sign in. DELETE: sign out. */
export async function GET(req: Request): Promise<Response> {
  return json({ authed: hasSession(req), configured: configured() });
}

export async function POST(req: Request): Promise<Response> {
  if (!configured()) return json({ error: "This deployment is not configured: set APP_PASSWORD and QB_USER_TOKEN." }, 503);
  let given = "";
  try {
    const b = (await req.json()) as { password?: string };
    given = String(b.password ?? "");
  } catch {
    return json({ error: "Send the password." }, 400);
  }
  if (!checkPassword(given)) {
    // A small, fixed delay takes the edge off guessing without a store.
    await new Promise((r) => setTimeout(r, 600));
    return json({ error: "That password is not right." }, 401);
  }
  return json({ authed: true }, 200, { "Set-Cookie": sessionCookie() });
}

export async function DELETE(): Promise<Response> {
  return json({ authed: false }, 200, { "Set-Cookie": clearCookie() });
}
