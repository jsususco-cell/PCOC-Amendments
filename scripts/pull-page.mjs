import { writeFileSync } from "fs";
const [pageid, outFile] = process.argv.slice(2);
const realm = process.env.QB_REALM, token = process.env.QB_USER_TOKEN, app = process.env.QB_APP_ID;
const base = `https://${realm}/db/${app}`;

async function xml(params) {
  const body = new URLSearchParams(params).toString();
  const r = await fetch(base, { method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "QB-Realm-Hostname": realm },
    body });
  return r.text();
}

const res = await xml({ act: "API_GetDBPage", pageID: pageid, usertoken: token });
let m = res.match(/<pagebody><!\[CDATA\[([\s\S]*)\]\]><\/pagebody>/);
let body;
if (m) {
  body = m[1];
} else {
  m = res.match(/<pagebody>([\s\S]*)<\/pagebody>/);
  if (!m) { console.error("could not find pagebody in response"); console.error(res.slice(0,500)); process.exit(1); }
  // Legacy encoding: literal <BR/> for newlines + HTML-entity-escaped content.
  body = m[1]
    .replace(/<BR\/>/g, "\n")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#0*39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&amp;/g, "&");
}
writeFileSync(outFile, body);
console.log(`pulled page ${pageid} -> ${outFile} (${body.length} chars)`);
