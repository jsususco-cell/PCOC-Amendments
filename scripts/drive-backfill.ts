/** One-time (or catch-up) copy of every case's papers to Drive. Same code as the nightly pass, no time limit.
 *  npx tsx --env-file=.env.local --env-file=.env.n8n scripts/drive-backfill.ts */
import { syncAll } from "../api/_lib/drive.ts";
const t = Date.now();
const r = await syncAll(6 * 3600_000);
console.log(JSON.stringify({ ...r, minutes: Math.round((Date.now() - t) / 6e4) }, null, 1));
