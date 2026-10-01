/**
 * What the app may do in Quickbase, table by table.
 *
 * The browser sends Quickbase XML-API calls (the same calls code page 177
 * makes) to /api/qb. The server checks each one against this list, adds its
 * own user token, and forwards it. Anything not listed is refused, so a
 * signed-in browser can do exactly what page 177 could do and nothing more.
 */
export const REALM = () => process.env.QB_REALM?.trim() || "byrdsonservices.quickbase.com";
export const TOKEN = () => process.env.QB_USER_TOKEN?.trim() ?? "";

type Action = "API_DoQuery" | "API_EditRecord" | "API_AddRecord";

interface Rule {
  name: string;
  actions: Action[];
  /** When set, an EditRecord may only touch these field ids. */
  editFields?: number[];
  /** Files under /up/ may be read from this table. */
  files?: boolean;
}

export const TABLES: Record<string, Rule> = {
  bwdhfcec4: { name: "PCOC Amendments (money rows)", actions: ["API_DoQuery", "API_EditRecord"], files: true },
  bwdpnd2fh: { name: "PCOC Amendment Cases", actions: ["API_DoQuery", "API_EditRecord", "API_AddRecord"], files: true },
  bwdpne6tg: { name: "Municipality Visits", actions: ["API_DoQuery", "API_EditRecord", "API_AddRecord"], files: true },
  bwdq6yr8p: { name: "PCOC Scope Files", actions: ["API_DoQuery", "API_EditRecord"], files: true },
  bwa36idkq: { name: "Municipal Arbitrio Rates", actions: ["API_DoQuery", "API_EditRecord", "API_AddRecord"] },
  // KTO Program Defaults. Read freely; the only setting this app writes is
  // "PCOC On Finished Houses" (76). Releasing held emails (77) stays in Quickbase.
  bv92hs97v: { name: "KTO Program Defaults", actions: ["API_DoQuery", "API_EditRecord"], editFields: [76], files: true },
  bv92569c9: { name: "KTO Outbox", actions: ["API_DoQuery", "API_AddRecord"] },
  bv8fa5vjd: { name: "CC Purchase Submissions (job cost)", actions: ["API_AddRecord"] },
  // Jobs: read for the narrative; page 177 writes back only these four facts.
  buskqh27b: { name: "Jobs", actions: ["API_DoQuery", "API_EditRecord"], editFields: [1027, 1028, 1771, 1773] },
};

export function checkCall(db: string, action: string, body: string): string | null {
  const rule = TABLES[db];
  if (!rule) return `Table ${db} is not one this app uses.`;
  if (!rule.actions.includes(action as Action)) return `${action} is not allowed on ${rule.name}.`;
  if (!body.startsWith("<qdbapi>") || !body.endsWith("</qdbapi>")) return "Malformed request.";
  if (action === "API_EditRecord" && rule.editFields) {
    const fids = [...body.matchAll(/<field\s+fid="(\d+)"/g)].map((m) => Number(m[1]));
    const bad = fids.filter((f) => !rule.editFields!.includes(f));
    if (bad.length) return `Field ${bad.join(", ")} on ${rule.name} cannot be changed from this app.`;
  }
  return null;
}

/** Strip any credential the browser sent and put the server's own in. */
export function withToken(body: string): string {
  const clean = body.replace(/<(apptoken|usertoken|ticket)>[\s\S]*?<\/\1>/g, "");
  return clean.replace("<qdbapi>", `<qdbapi><usertoken>${TOKEN()}</usertoken>`);
}

/** /up/{db}/a/r{rid}/e{fid}/v{n} — the only file path shape page 177 reads. */
export function fileTable(path: string): string | null {
  const m = path.match(/^\/up\/([a-z0-9]{9})\/a\/r(\d+)\/e(\d+)\/v(\d+)$/);
  if (!m) return null;
  return TABLES[m[1]]?.files ? m[1] : null;
}
