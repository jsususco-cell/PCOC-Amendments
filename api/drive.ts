import { json, requireSession } from "./_lib/auth.js";
import { caseFolder, driveConfigured, papersOf, syncAll, syncCase } from "./_lib/drive.js";

/**
 * Papers → Google Drive, one folder per case number (see _lib/drive.ts).
 *
 * POST /api/drive {rid}        signed in: copy that case's new or changed papers now.
 * GET  /api/drive?rid=         signed in: the case's Drive folder link (never creates it).
 * GET  /api/drive              from Vercel Cron (Authorization: Bearer CRON_SECRET):
 *                              the nightly pass over every case.
 */
function fromCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  return !!secret && req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: Request): Promise<Response> {
  if (!driveConfigured()) return json({ error: "PCOC_DRIVE_TOKEN is not set on this deployment." }, 503);
  if (fromCron(req)) {
    try { return json(await syncAll()); } catch (e) { return json({ error: (e as Error).message }, 502); }
  }
  const denied = requireSession(req);
  if (denied) return denied;
  const rid = Number(new URL(req.url).searchParams.get("rid"));
  if (!rid) return json({ error: "rid is required." }, 400);
  try {
    const { cs } = await papersOf(rid);
    const f = await caseFolder(cs, false);
    return json({ cs, folderLink: f.folderLink, files: f.files.length });
  } catch (e) {
    return json({ error: (e as Error).message }, 502);
  }
}

export async function POST(req: Request): Promise<Response> {
  const denied = requireSession(req);
  if (denied) return denied;
  if (!driveConfigured()) return json({ error: "PCOC_DRIVE_TOKEN is not set on this deployment." }, 503);
  let body: { rid?: number };
  try { body = await req.json(); } catch { return json({ error: "Send JSON." }, 400); }
  const rid = Number(body.rid);
  if (!rid) return json({ error: "rid is required." }, 400);
  try {
    return json(await syncCase(rid));
  } catch (e) {
    return json({ error: (e as Error).message }, 502);
  }
}
