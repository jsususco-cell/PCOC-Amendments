import { json, requireSession } from "./_lib/auth.js";
import { REALM, checkCall, withToken } from "./_lib/quickbase.js";

/**
 * POST /api/qb?db=<table>&action=<API_*>  body: <qdbapi>…</qdbapi>
 * Forwards an allowed Quickbase XML-API call with the server's token.
 */
export async function POST(req: Request): Promise<Response> {
  const denied = requireSession(req);
  if (denied) return denied;

  const url = new URL(req.url);
  const db = url.searchParams.get("db") ?? "";
  const action = url.searchParams.get("action") ?? "";
  const body = (await req.text()).trim();

  const why = checkCall(db, action, body);
  if (why) return json({ error: why }, 403);

  const r = await fetch(`https://${REALM()}/db/${db}`, {
    method: "POST",
    headers: { "Content-Type": "application/xml", "QUICKBASE-ACTION": action },
    body: withToken(body),
  });
  return new Response(await r.text(), {
    status: r.status,
    headers: { "Content-Type": "text/xml; charset=utf-8", "Cache-Control": "no-store" },
  });
}
