import { json, requireSession } from "./_lib/auth.js";
import { applyPlan, buildPlan } from "./_lib/feed.js";

/**
 * GET  /api/feed            signed in: the plan only (dry run) — new cases it
 *                           would add, and cases where Canopy has moved (flags).
 * GET  /api/feed            from Vercel Cron (Authorization: Bearer CRON_SECRET):
 *                           builds the plan and ADDS the new cases.
 * POST /api/feed            signed in: add the new cases now.
 *
 * It never changes a case that is already in PCOC.
 */
function fromCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  return !!secret && req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: Request): Promise<Response> {
  if (fromCron(req)) return run();
  const denied = requireSession(req);
  if (denied) return denied;
  try {
    return json(await buildPlan());
  } catch (e) {
    return json({ error: (e as Error).message }, 502);
  }
}

export async function POST(req: Request): Promise<Response> {
  const denied = requireSession(req);
  if (denied) return denied;
  return run();
}

async function run(): Promise<Response> {
  try {
    const plan = await buildPlan();
    const done = await applyPlan(plan);
    console.log("[pcoc-feed]", JSON.stringify({ ...done, flagged: plan.review.length, noPermitDate: plan.noPermitDate.length }));
    return json({ ...done, flagged: plan.review.length, review: plan.review, at: plan.at });
  } catch (e) {
    console.error("[pcoc-feed] failed:", (e as Error).message);
    return json({ error: (e as Error).message }, 502);
  }
}
