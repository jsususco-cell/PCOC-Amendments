import { json, requireSession } from "./_lib/auth.js";
import { REALM, TOKEN, fileTable } from "./_lib/quickbase.js";

/**
 * GET /api/up?p=/up/<table>/a/r<rid>/e<fid>/v0
 * Streams a Quickbase file attachment (letters, packs, receipts, scope PDFs).
 */
export async function GET(req: Request): Promise<Response> {
  const denied = requireSession(req);
  if (denied) return denied;

  const p = new URL(req.url).searchParams.get("p") ?? "";
  if (!fileTable(p)) return json({ error: "That file is not one this app reads." }, 403);

  const r = await fetch(`https://${REALM()}${p}?usertoken=${encodeURIComponent(TOKEN())}`);
  if (!r.ok || !r.body) return json({ error: `Quickbase returned ${r.status} for that file.` }, r.status === 404 ? 404 : 502);

  const headers: Record<string, string> = { "Cache-Control": "private, no-store" };
  for (const h of ["content-type", "content-length", "content-disposition"]) {
    const v = r.headers.get(h);
    if (v) headers[h] = v;
  }
  return new Response(r.body, { status: 200, headers });
}
