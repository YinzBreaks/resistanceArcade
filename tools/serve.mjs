// Local preview that sends the same headers as production, so CSP violations
// show up in the console here instead of after a deploy.
//
//   node tools/serve.mjs        -> http://localhost:4174
//
// Headers are read straight out of vercel.json: there is one source of truth,
// and a header added there is exercised locally without touching this file.

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
// Parenthesised groups — "(.*)", "(css|js)" — are kept as real regex; every
// other character is escaped. Escaping first would destroy the groups.
const toRegExp = (source) => {
  const group = /\(([^)]*)\)/g;
  const esc = (s) => s.replace(/[.*+?^${}|[\]\\]/g, "\\$&");
  let out = "";
  let last = 0;
  let m;
  while ((m = group.exec(source))) {
    out += esc(source.slice(last, m.index)) + "(" + m[1] + ")";
    last = m.index + m[0].length;
  }
  return new RegExp("^" + out + esc(source.slice(last)) + "$");
};

const rules = (config.headers ?? []).map((r) => ({
  test: toRegExp(r.source),
  headers: r.headers,
}));

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
  let pathname = decodeURIComponent(url.pathname);
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
