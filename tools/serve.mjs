// Local preview that sends the same headers, redirects and rewrites as
// production, so CSP violations show up in the console here instead of after
// a deploy.
//
//   node tools/serve.mjs        -> http://localhost:4174
//
// Headers are read straight out of vercel.json: there is one source of truth,
// and a header added there is exercised locally without touching this file.
//
// ── Why vercel.json looks the way it does ──────────────────────────────────
// (it cannot say so itself — JSON has no comments, and Vercel's schema
// rejects "//" keys with: headers[0] should NOT have additional property)
//
// Two CSP rules, not one. A rewrite is a server-side proxy, so this project's
// headers land on the *games'* HTML. Each game is a single self-contained file
// with an inline <script>, an inline <style> and inline style attributes, so
// the hub's strict policy would leave three blank canvases. The cabinets get
// 'unsafe-inline' for script and style and nothing else — no third-party
// origin is reachable from a cabinet either, so zero-trust still holds.
//
// The hub's rule is a negative lookahead rather than a second rule overriding
// the first, because a browser handed two CSP headers enforces their
// INTERSECTION — which would strip the cabinets' 'unsafe-inline' right back
// out. Do not "simplify" these into one rule.
//
// No "trailingSlash". The three /flapper -> /flapper/ redirects need it unset:
// "trailingSlash": false strips the slash the redirect just added, and the two
// fight each other into a redirect loop.

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const PORT = Number(process.env.PORT) || 4174;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".mp4": "video/mp4",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};

const config = JSON.parse(await readFile(join(ROOT, "vercel.json"), "utf8"));

// Vercel's `source` globs, reduced to what this file actually uses.
// Parenthesised groups — "(.*)", "(css|js)", "((?!a|b).*)" — are kept as real
// regex; every other character is escaped. Escaping first would destroy the
// groups, and the brace counter is needed because lookaheads nest parens.
const toRegExp = (source) => {
  const esc = (s) => s.replace(/[.*+?^${}|[\]\\]/g, "\\$&");
  let out = "";
  let buf = "";
  let depth = 0;
  for (const ch of source) {
    if (ch === "(") {
      if (depth === 0) {
        out += esc(buf);
        buf = "";
      }
      depth++;
      buf += ch;
    } else if (ch === ")") {
      depth--;
      buf += ch;
      if (depth === 0) {
        out += buf;
        buf = "";
      }
    } else if (depth === 0 && buf === "" && "?*+".includes(ch) && out.endsWith(")")) {
      // a quantifier on the group just closed — "(/.*)?" — keep it as regex
      out += ch;
    } else {
      buf += ch;
    }
  }
  out += depth === 0 ? esc(buf) : buf;
  // ":path*" style params -> a capture that eats the rest
  out = out.replace(/:(\w+)\\\*/g, "(.*)").replace(/:(\w+)/g, "([^/]+)");
  return new RegExp("^" + out + "$");
};

const rules = (config.headers ?? []).map((r) => ({
  test: toRegExp(r.source),
  headers: r.headers,
}));

const rewrites = (config.rewrites ?? []).map((r) => ({
  test: toRegExp(r.source),
  destination: r.destination,
}));

const redirects = (config.redirects ?? []).map((r) => ({
  test: toRegExp(r.source),
  destination: r.destination,
  status: r.permanent ? 308 : 307,
}));

// Proxy a rewrite the way Vercel does: same URL in the browser, someone
// else's bytes in the response, and THIS project's headers on top.
const proxy = async (dest, match, req, res, pathname) => {
  const target = dest.replace(/:(\w+)\*?/g, () => match[1] ?? "");
  try {
    const upstream = await fetch(target, { headers: { accept: req.headers.accept ?? "*/*" }, redirect: "follow" });
    const body = Buffer.from(await upstream.arrayBuffer());
    res.writeHead(upstream.status, {
      "Content-Type": upstream.headers.get("content-type") ?? "application/octet-stream",
      ...headersFor(pathname),
    });
    res.end(body);
    console.log(`${upstream.status} ${pathname} -> ${target}`);
  } catch (err) {
    console.error(`502 ${pathname} -> ${target}: ${err.message}`);
    res.writeHead(502, { "Content-Type": "text/plain", ...headersFor(pathname) }).end("upstream failed");
  }
};

const headersFor = (pathname) => {
  const out = {};
  for (const rule of rules) {
    if (rule.test.test(pathname)) {
      for (const { key, value } of rule.headers) out[key] = value;
    }
  }
  return out;
};

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const rawPath = decodeURIComponent(url.pathname);

  // redirects run before rewrites, same as Vercel
  for (const r of redirects) {
    const m = rawPath.match(r.test);
    if (m) {
      const to = r.destination.replace(/:(\w+)\*?/g, () => m[1] ?? "");
      console.log(`${r.status} ${rawPath} -> ${to}`);
      res.writeHead(r.status, { Location: to, ...headersFor(rawPath) });
      res.end();
      return;
    }
  }

  for (const r of rewrites) {
    const m = rawPath.match(r.test);
    if (m) return proxy(r.destination, m, req, res, rawPath);
  }

  let pathname = rawPath;
  if (pathname.endsWith("/")) pathname += "index.html";

  // keep requests inside ROOT
  const target = join(ROOT, normalize(pathname).replace(/^(\.\.[/\\])+/, ""));
  if (!target.startsWith(ROOT)) {
    res.writeHead(403).end("forbidden");
    return;
  }

  const send = (code, body, type) => {
    res.writeHead(code, {
      "Content-Type": type ?? "text/plain; charset=utf-8",
      ...headersFor(pathname),
    });
    res.end(body);
  };

  if (!existsSync(target) || !statSync(target).isFile()) {
    console.log(`404 ${pathname}`);
    send(404, "not found");
    return;
  }

  try {
    const body = await readFile(target);
    send(200, body, TYPES[extname(target).toLowerCase()] ?? "application/octet-stream");
  } catch (err) {
    console.error(`500 ${pathname}`, err.message);
    send(500, "server error");
  }
}).listen(PORT, "127.0.0.1", () => {
  console.log(`Resistance Arcade -> http://localhost:${PORT} (production headers)`);
});
