# PCOC Amendments

When the Program approves more scope on a Puerto Rico job **after** the construction permit was issued, Byrdson has to amend the permit (a PCOC amendment), pay the extra municipal taxes (arbitrios and patente), prove it to the PA and close it out. This app runs that process from start to finish.

It replaces the Quickbase code page 177 UI with a Permitting Helper–style app. **It uses the existing Quickbase tables as they are.** It adds no tables and no fields.

## Tabs, start to finish

| Tab | Who | Ends when |
|---|---|---|
| **Board** | everyone | Overview: every case, its step, days in step, stuck list |
| **Intake** | Priscilla | Each case is decided: needs an amendment, parked (Structure / finished house / refund), or not required |
| **1 · Prepare** | permit team | Cost Estimate, Project Narrative and Harold's drawings are sent to the PA |
| **2 · With the PA** | the PA | The Permit Amendment Notice is in and the new permit number is typed |
| **3 · Pay the town** | Priscilla | A trip is logged as Paid (cases are grouped per town: one trip, one printed pack) |
| **4 · Proof to the PA** | permit team | Sticker ordered, sign photo and town receipt in, proof sent |
| **5 · Close** | the PA | Approved is marked in Canopy and the closed date is in |
| Trips | Priscilla | Log every trip to a town. When it was paid, the same save records the payment on each scope change and posts the job cost |
| Payments | Priscilla, managers | Money per scope change. Read-first table with a side panel. Never changes the amendment status |
| Emails | Jim | Everything PCOC put in the KTO Outbox, the reminder rules and the mail settings (read-only) |
| Rates | Priscilla | Arbitrio and patente rate per town. Saving recalculates every scope change in that town |

A case moves to the next step **by itself** once its dates and papers are in. The stage is derived (`derive()`), never typed.

## How it is built

```
browser ── React UI (src/) ──► public/engine.js       logic lifted verbatim from code page 177
                               public/engine-app.js   app layer: saves, trips, rates, upkeep
            │  XML-API calls / file reads
            ▼
Vercel ── api/qb.ts   allowlisted Quickbase XML-API proxy (adds the server's user token)
          api/up.ts   file relay for /up/… attachments
          api/session.ts   Google Workspace sign-in (byrdsonservices.com only)
            ▼
Quickbase, Construction Management_V2 (buskqh26r)
```

* **Why keep page 177's code?** It holds about 1,700 lines of tested logic: stage rules, the letter, calculation sheet, revised estimate, narrative and print-pack builders, the Xactimate/Canopy readers, the emails and reminders, and the job-cost poster. `scripts/extract-engine.mjs` lifts that code as-is and only swaps the parts tied to the Quickbase page (the DOM handlers and the boot sequence are dropped, `/db/` goes to `/api/qb`, `/up/` goes to `/api/up`).
* **The token never reaches the browser.** `api/_lib/quickbase.ts` lists every table, every action and, for Settings and Jobs, the only fields the app may write. Anything else gets a 403. The app cannot release held emails (Settings fid 77). That stays a deliberate step in Quickbase.

### Tables used (no changes)

| Table | id | Access |
|---|---|---|
| PCOC Amendments (money rows) | `bwdhfcec4` | read, edit |
| PCOC Amendment Cases | `bwdpnd2fh` | read, edit, add |
| Municipality Visits | `bwdpne6tg` | read, edit, add |
| PCOC Scope Files | `bwdq6yr8p` | read, edit |
| Municipal Arbitrio Rates | `bwa36idkq` | read, edit, add |
| KTO Program Defaults | `bv92hs97v` | read; edit fid 76 only |
| KTO Outbox | `bv92569c9` | read, add |
| CC Purchase Submissions | `bv8fa5vjd` | add (job cost) |
| Jobs | `buskqh27b` | read; edit fids 1027, 1028, 1771, 1773 only |

## Sync ("upkeep")

Page 177 did its background work every time anyone opened it. The work: create cases for new scope changes, stamp dates from sent emails, read new scope files, build documents, write reminders. Here that runs **on purpose**: by itself at most every 6 hours per browser while the app is open, or with **Sync now** on the Board. Moving it to a scheduled n8n job is the next step. Until then, page 177 also still runs the same work whenever someone opens it.

## Run locally

```bash
cp .env.example .env.local     # fill QB_USER_TOKEN, the Google client and AUTH_SECRET
npm install
npm run dev                    # http://localhost:8080, /api runs in-process
```

## Deploy to Vercel

1. Import this repo in Vercel. The framework is detected as Vite: build `npm run build`, output `dist`.
2. Set the environment variables (Production and Preview):
   * `QB_REALM` = `byrdsonservices.quickbase.com`
   * `QB_USER_TOKEN`: a user token with access to Construction Management_V2
   * `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`: the Google OAuth client (shared with the Permitting Helper)
   * `AUTH_ALLOWED_DOMAIN` = `byrdsonservices.com`
   * `AUTH_SECRET`: 32+ random characters; it signs the sessions. Changing it signs everyone out.
3. In Google Cloud Console, add `https://<your-domain>/api/auth/callback` to the OAuth client's **Authorized redirect URIs**.
4. Deploy. `/api/health` reports `configured: true` when everything is set. The app refuses to serve Quickbase data without it.

## Sign-in

Google Workspace only: byrdsonservices.com accounts, the same flow as the Permitting Helper. The domain is checked on the server, not just hinted to Google's account chooser. There is no shared password. A session lasts 12 hours. To remove someone's access, disable their Workspace account.

## Limits

* Uploads go through a serverless function, which caps the request body at about 4.5 MB. Base64 adds a third, so keep files under about 3 MB. Larger files go in the case's Drive folder.
* Quickbase still records the token's owner as the author of every change. The app fills the signed-in name into "Who went", "Paid by" and "pasted in Canopy by".

## Regenerating the engine from page 177

```bash
npm run engine:pull     # pulls page 177 and rebuilds public/engine.js
npm run check:engine    # syntax check
```
