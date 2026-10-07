/**
 * Creates (or updates) the two n8n workflows that copy PCOC papers into
 * Google Drive, one folder per case number under the PCOC root folder.
 *
 *   node --env-file=.env.n8n scripts/provision-drive.mjs                     # dry run
 *   node --env-file=.env.n8n scripts/provision-drive.mjs --apply --activate  # create/update
 *
 * Same pattern as the Permitting Helper's Drive filing: n8n holds the Google
 * credential, the app holds none. The app reads the papers from Quickbase
 * itself and sends n8n only what it needs.
 *
 *   POST /webhook/pcoc-drive-folder  { secret, caseNumber, create }
 *        → { ok, folderId, folderLink, files: [{ id, name, webViewLink, appProperties }] }
 *        Finds the case's folder (named exactly the case number) under the root,
 *        creates it when `create` is true, and lists what is in it.
 *   POST /webhook/pcoc-drive-file    { secret, folderId, fileName, mimeType, fileBase64, key, version, fileId? }
 *        → { ok, fileId, webViewLink }
 *        Files one paper. With fileId it replaces that file's content (the link
 *        stays the same); without, it creates a new file in the folder.
 *        appProperties.pcocKey / pcocVersion record which Quickbase attachment
 *        (table/record/field) and version the copy is, so the app re-sends only
 *        what changed.
 */
const N8N = "https://n8n.byrdsonservices.com";
const KEY = process.env.N8N_KEY;
const SECRET = process.env.PCOC_DRIVE_TOKEN;
const ROOT = process.env.PCOC_DRIVE_ROOT;
const APPLY = process.argv.includes("--apply");
const ACTIVATE = process.argv.includes("--activate");
/** "Byrdson Admin Google Drive account" — already in n8n, used by the other Drive flows. */
const DRIVE_CREDENTIAL = { id: "dgQ2YAV9YKro3G8w", name: "Byrdson Admin Google Drive account" };

if (!KEY || !SECRET || !ROOT) { console.error("N8N_KEY, PCOC_DRIVE_TOKEN and PCOC_DRIVE_ROOT are required"); process.exit(1); }

async function api(method, path, body) {
  const res = await fetch(`${N8N}/api/v1${path}`, {
    method,
    headers: { "X-N8N-API-KEY": KEY, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(json).slice(0, 400)}`);
  return json;
}

const webhook = (id, path) => ({
  parameters: { httpMethod: "POST", path, responseMode: "responseNode", options: {} },
  id, name: "Webhook", type: "n8n-nodes-base.webhook", typeVersion: 2, position: [-200, 0], webhookId: id,
});
const secretCheck = (id) => ({
  parameters: {
    conditions: {
      options: { caseSensitive: true, leftValue: "", typeValidation: "strict", version: 2 },
      conditions: [{ id: "secret", leftValue: "={{ $json.body.secret }}", rightValue: SECRET, operator: { type: "string", operation: "equals" } }],
      combinator: "and",
    },
    options: {},
  },
  id, name: "Secret matches?", type: "n8n-nodes-base.if", typeVersion: 2.2, position: [20, 0],
});
const refuse = (id) => ({
  parameters: { respondWith: "json", responseBody: '={{ JSON.stringify({ ok: false, error: "Unauthorised." }) }}', options: { responseCode: 401 } },
  id, name: "Refuse", type: "n8n-nodes-base.respondToWebhook", typeVersion: 1.1, position: [260, 160],
});
const ifNode = (id, name, left, op, position) => ({
  parameters: {
    conditions: {
      options: { caseSensitive: true, leftValue: "", typeValidation: "loose", version: 2 },
      conditions: [{ id: "c", leftValue: left, rightValue: "", operator: op }],
      combinator: "and",
    },
    looseTypeValidation: true,
    options: {},
  },
  id, name, type: "n8n-nodes-base.if", typeVersion: 2.2, position,
});
const http = (id, name, o, position) => ({
  parameters: {
    method: o.method,
    url: o.url,
    authentication: "predefinedCredentialType",
    nodeCredentialType: "googleDriveOAuth2Api",
    sendQuery: true,
    queryParameters: { parameters: o.query },
    ...(o.json ? { sendBody: true, specifyBody: "json", jsonBody: o.json } : {}),
    ...(o.binary ? { sendBody: true, contentType: "binaryData", inputDataFieldName: "data" } : {}),
    options: {},
  },
  id, name, type: "n8n-nodes-base.httpRequest", typeVersion: 4.2, position,
  credentials: { googleDriveOAuth2Api: DRIVE_CREDENTIAL },
});
const ALL = [{ name: "supportsAllDrives", value: "true" }, { name: "includeItemsFromAllDrives", value: "true" }];
/** Drive query strings quote with ' : escape \ and ' in names. */
const q = (expr) => `{{ String(${expr}).replace(/\\\\/g, '\\\\\\\\').replace(/'/g, "\\\\'") }}`;

/* ---------- 1. Case folder: find (or create) and list ---------- */
const folderNodes = [
  webhook("b1000000-0000-4000-8000-000000000001", "pcoc-drive-folder"),
  secretCheck("b1000000-0000-4000-8000-000000000002"),
  refuse("b1000000-0000-4000-8000-000000000003"),
  http("b1000000-0000-4000-8000-000000000004", "Find case folder", {
    method: "GET", url: "https://www.googleapis.com/drive/v3/files",
    query: [
      { name: "q", value: `=name = '${q("$('Webhook').item.json.body.caseNumber")}' and '${ROOT}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false` },
      { name: "fields", value: "files(id,name,webViewLink)" },
      ...ALL,
    ],
  }, [260, -100]),
  ifNode("b1000000-0000-4000-8000-000000000005", "Has folder?", "={{ ($json.files || []).length }}", { type: "number", operation: "gt" }, [480, -100]),
  ifNode("b1000000-0000-4000-8000-000000000006", "Create it?", "={{ $('Webhook').item.json.body.create === true }}", { type: "boolean", operation: "true", singleValue: true }, [700, 40]),
  http("b1000000-0000-4000-8000-000000000007", "Create case folder", {
    method: "POST", url: "https://www.googleapis.com/drive/v3/files",
    query: [{ name: "fields", value: "id,name,webViewLink" }, { name: "supportsAllDrives", value: "true" }],
    json: `={{ JSON.stringify({ name: $('Webhook').item.json.body.caseNumber, mimeType: 'application/vnd.google-apps.folder', parents: ['${ROOT}'] }) }}`,
  }, [920, 0]),
  {
    parameters: {
      mode: "manual", duplicateItem: false,
      assignments: { assignments: [
        { id: "f1", name: "folderId", value: "={{ ($('Find case folder').item.json.files || [])[0]?.id || $json.id }}", type: "string" },
        { id: "f2", name: "folderLink", value: "={{ ($('Find case folder').item.json.files || [])[0]?.webViewLink || $json.webViewLink }}", type: "string" },
      ] },
      options: {},
    },
    id: "b1000000-0000-4000-8000-000000000008", name: "Folder", type: "n8n-nodes-base.set", typeVersion: 3.4, position: [1140, -100],
  },
  http("b1000000-0000-4000-8000-000000000009", "List folder", {
    method: "GET", url: "https://www.googleapis.com/drive/v3/files",
    query: [
      { name: "q", value: "='{{ $json.folderId }}' in parents and trashed = false" },
      { name: "fields", value: "files(id,name,webViewLink,appProperties)" },
      { name: "pageSize", value: "1000" },
      ...ALL,
    ],
  }, [1360, -100]),
  {
    parameters: {
      respondWith: "json",
      responseBody: "={{ JSON.stringify({ ok: true, folderId: $('Folder').item.json.folderId, folderLink: $('Folder').item.json.folderLink, files: $json.files || [] }) }}",
      options: {},
    },
    id: "b1000000-0000-4000-8000-00000000000a", name: "Respond", type: "n8n-nodes-base.respondToWebhook", typeVersion: 1.1, position: [1580, -100],
  },
  {
    parameters: { respondWith: "json", responseBody: '={{ JSON.stringify({ ok: true, folderId: null, folderLink: null, files: [] }) }}', options: {} },
    id: "b1000000-0000-4000-8000-00000000000b", name: "Respond no folder", type: "n8n-nodes-base.respondToWebhook", typeVersion: 1.1, position: [920, 160],
  },
];
const folderConnections = {
  Webhook: { main: [[{ node: "Secret matches?", type: "main", index: 0 }]] },
  "Secret matches?": { main: [[{ node: "Find case folder", type: "main", index: 0 }], [{ node: "Refuse", type: "main", index: 0 }]] },
  "Find case folder": { main: [[{ node: "Has folder?", type: "main", index: 0 }]] },
  "Has folder?": { main: [[{ node: "Folder", type: "main", index: 0 }], [{ node: "Create it?", type: "main", index: 0 }]] },
  "Create it?": { main: [[{ node: "Create case folder", type: "main", index: 0 }], [{ node: "Respond no folder", type: "main", index: 0 }]] },
  "Create case folder": { main: [[{ node: "Folder", type: "main", index: 0 }]] },
  Folder: { main: [[{ node: "List folder", type: "main", index: 0 }]] },
  "List folder": { main: [[{ node: "Respond", type: "main", index: 0 }]] },
};

/* ---------- 2. File one paper ---------- */
const B = "$('Webhook').item.json.body";
const fileNodes = [
  webhook("c1000000-0000-4000-8000-000000000001", "pcoc-drive-file"),
  secretCheck("c1000000-0000-4000-8000-000000000002"),
  refuse("c1000000-0000-4000-8000-000000000003"),
  ifNode("c1000000-0000-4000-8000-000000000004", "Replace a file?", `={{ ${B}.fileId || '' }}`, { type: "string", operation: "notEmpty", singleValue: true }, [260, -100]),
  http("c1000000-0000-4000-8000-000000000005", "Create file entry", {
    method: "POST", url: "https://www.googleapis.com/drive/v3/files",
    query: [{ name: "fields", value: "id" }, { name: "supportsAllDrives", value: "true" }],
    json: `={{ JSON.stringify({ name: ${B}.fileName, mimeType: ${B}.mimeType, parents: [${B}.folderId] }) }}`,
  }, [480, 0]),
  {
    /* An HTTP node replaces its item, binary included: the base64 is turned
       into a file only after the Drive entry exists (Helper lesson). */
    parameters: {
      mode: "manual", duplicateItem: false,
      assignments: { assignments: [
        { id: "f1", name: "fileId", value: `={{ ${B}.fileId || $json.id }}`, type: "string" },
        { id: "f2", name: "fileBase64", value: `={{ ${B}.fileBase64 }}`, type: "string" },
      ] },
      options: {},
    },
    id: "c1000000-0000-4000-8000-000000000006", name: "Target", type: "n8n-nodes-base.set", typeVersion: 3.4, position: [700, -100],
  },
  {
    parameters: { operation: "toBinary", sourceProperty: "fileBase64", options: { fileName: `={{ ${B}.fileName }}`, mimeType: `={{ ${B}.mimeType }}` } },
    id: "c1000000-0000-4000-8000-000000000007", name: "Base64 to file", type: "n8n-nodes-base.convertToFile", typeVersion: 1.1, position: [920, -100],
  },
  http("c1000000-0000-4000-8000-000000000008", "Upload content", {
    method: "PATCH", url: "=https://www.googleapis.com/upload/drive/v3/files/{{ $('Target').item.json.fileId }}",
    query: [{ name: "uploadType", value: "media" }, { name: "supportsAllDrives", value: "true" }, { name: "fields", value: "id" }],
    binary: true,
  }, [1140, -100]),
  http("c1000000-0000-4000-8000-000000000009", "Name and tag", {
    method: "PATCH", url: "=https://www.googleapis.com/drive/v3/files/{{ $('Target').item.json.fileId }}",
    query: [{ name: "supportsAllDrives", value: "true" }, { name: "fields", value: "id,name,webViewLink" }],
    json: `={{ JSON.stringify({ name: ${B}.fileName, appProperties: { pcocKey: String(${B}.key), pcocVersion: String(${B}.version) } }) }}`,
  }, [1360, -100]),
  {
    parameters: { respondWith: "json", responseBody: "={{ JSON.stringify({ ok: true, fileId: $json.id, webViewLink: $json.webViewLink, name: $json.name }) }}", options: {} },
    id: "c1000000-0000-4000-8000-00000000000a", name: "Respond", type: "n8n-nodes-base.respondToWebhook", typeVersion: 1.1, position: [1580, -100],
  },
];
const fileConnections = {
  Webhook: { main: [[{ node: "Secret matches?", type: "main", index: 0 }]] },
  "Secret matches?": { main: [[{ node: "Replace a file?", type: "main", index: 0 }], [{ node: "Refuse", type: "main", index: 0 }]] },
  "Replace a file?": { main: [[{ node: "Target", type: "main", index: 0 }], [{ node: "Create file entry", type: "main", index: 0 }]] },
  "Create file entry": { main: [[{ node: "Target", type: "main", index: 0 }]] },
  Target: { main: [[{ node: "Base64 to file", type: "main", index: 0 }]] },
  "Base64 to file": { main: [[{ node: "Upload content", type: "main", index: 0 }]] },
  "Upload content": { main: [[{ node: "Name and tag", type: "main", index: 0 }]] },
  "Name and tag": { main: [[{ node: "Respond", type: "main", index: 0 }]] },
};

async function upsert(all, name, nodes, connections, path) {
  const existing = (all.data || []).find((w) => w.name === name);
  console.log(`\n${name}\n  webhook  POST ${N8N}/webhook/${path}\n  ${existing ? `exists   ${existing.id}` : "new"}`);
  if (!APPLY) return;
  const payload = { name, nodes, connections, settings: { executionOrder: "v1", timezone: "America/Puerto_Rico" } };
  const saved = existing ? await api("PUT", `/workflows/${existing.id}`, payload) : await api("POST", "/workflows", payload);
  console.log(`  ${existing ? "updated" : "created"} ${saved.id}`);
  if (ACTIVATE && !saved.active) { await api("POST", `/workflows/${saved.id}/activate`); console.log("  activated"); }
}

(async () => {
  const all = await api("GET", "/workflows?limit=250");
  console.log(`root     ${ROOT}\ndrive    ${DRIVE_CREDENTIAL.name}`);
  await upsert(all, "PCOC → Drive: Case Folder", folderNodes, folderConnections, "pcoc-drive-folder");
  await upsert(all, "PCOC → Drive: File Paper", fileNodes, fileConnections, "pcoc-drive-file");
  if (!APPLY) console.log("\n  dry run — re-run with --apply --activate\n");
})().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
