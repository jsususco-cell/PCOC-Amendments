import type { Plugin, ViteDevServer } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * Runs the /api handlers inside `vite dev`, the way Vercel runs them:
 * each file exports GET / POST / DELETE taking a Web Request and returning a
 * Web Response. Development only.
 */
export function apiRoutes(): Plugin {
  return {
    name: "pcoc-api-routes",
    apply: "serve",
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
        const url = req.url ?? "";
        if (!url.startsWith("/api/")) return next();
        let route = url.split("?")[0].replace(/^\/api\//, "").replace(/\/$/, "");
        // Same rewrites as vercel.json: /api/auth/<action> -> /api/session?action=<action>
        const auth = route.match(/^auth\/(start|callback|signout)$/);
        if (auth) {
          const q = new URL(url, "http://x").searchParams;
          q.set("action", auth[1]);
          route = "session";
          req.url = `/api/session?${q.toString()}`;
        }
        if (!route || route.startsWith("_") || route.includes("..")) return send(res, 404, { error: "No such route" });
        try {
          const mod = await server.ssrLoadModule(`/api/${route}.ts`);
          const method = (req.method ?? "GET").toUpperCase();
          const handler = mod[method] as ((r: Request) => Promise<Response>) | undefined;
          if (typeof handler !== "function") return send(res, 405, { error: `${method} not allowed` });
          const response = await handler(await toWebRequest(req));
          res.statusCode = response.status;
          response.headers.forEach((v, k) => { if (k.toLowerCase() !== "set-cookie") res.setHeader(k, v); });
          const cookies = response.headers.getSetCookie?.() ?? [];
          // Kept Secure: browsers treat http://localhost as a secure context, and SameSite=None requires it.
          if (cookies.length) res.setHeader("Set-Cookie", cookies);
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          server.config.logger.error(`[api] /api/${route}: ${msg}`);
          send(res, 500, { error: msg });
        }
      });
    },
  };
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

async function toWebRequest(req: IncomingMessage): Promise<Request> {
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (v === undefined) continue;
    for (const x of Array.isArray(v) ? v : [v]) headers.append(k, x);
  }
  const method = req.method ?? "GET";
  let body: Buffer | undefined;
  if (method !== "GET" && method !== "HEAD") {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    body = Buffer.concat(chunks);
  }
  return new Request(new URL(`http://${req.headers.host ?? "localhost"}${req.url}`), {
    method,
    headers,
    body: body && body.length ? new Uint8Array(body) : undefined,
  });
}
