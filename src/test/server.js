const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const port = 8765;
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".ico": "image/x-icon"
};

function proxy(req, res) {
  const headers = { ...req.headers, host: "sc.leye.site", "accept-encoding": "identity" };
  delete headers.origin;
  delete headers.referer;
  const upstream = https.request({
    hostname: "sc.leye.site",
    path: req.url,
    method: req.method,
    headers
  }, upstreamRes => {
    const out = { ...upstreamRes.headers };
    delete out["transfer-encoding"];
    delete out["content-encoding"];
    delete out["content-length"];
    res.writeHead(upstreamRes.statusCode || 502, out);
    upstreamRes.pipe(res);
  });
  upstream.on("error", () => {
    if (!res.headersSent) res.writeHead(502);
    res.end("proxy error");
  });
  req.pipe(upstream);
}

const cdnCache = new Map();

function fetchBuffer(hostname, urlPath) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname,
      path: urlPath,
      method: "GET",
      headers: { host: hostname, "accept-encoding": "identity" }
    }, upstream => {
      const chunks = [];
      upstream.on("data", chunk => chunks.push(chunk));
      upstream.on("end", () => resolve({ status: upstream.statusCode || 502, body: Buffer.concat(chunks) }));
    });
    req.on("error", reject);
    req.end();
  });
}

function patchCadView(source) {
  const renderer = 'let t={antialias:!0,precision:"highp",alpha:!0}';
  const rendererNext = 'let t={antialias:!0,precision:"highp",alpha:!0,preserveDrawingBuffer:!0}';
  const init = "this.m_DomEl=e,this.initRender(e),this.OnSize()";
  const initNext = "this.m_DomEl=e,this.initRender(e),this.m_Render.domElement.__viewer=this,this.OnSize()";
  if (!source.includes(renderer) || !source.includes(init)) {
    throw new Error("CADView patch point missing");
  }
  return source.replace(renderer, rendererNext).replace(init, initNext);
}

async function cdnAsset(urlPath) {
  if (cdnCache.has(urlPath)) return cdnCache.get(urlPath);
  const loaded = await fetchBuffer("cdn.leye.site", urlPath);
  if (loaded.status !== 200) return loaded;
  let body = loaded.body;
  if (urlPath.endsWith("/CADView-B5OwdNAZ.js")) body = Buffer.from(patchCadView(body.toString("utf8")));
  const result = { status: 200, body };
  cdnCache.set(urlPath, result);
  return result;
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith("/api/")) {
    proxy(req, res);
    return;
  }
  const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
  const file = path.resolve(root, rel);
  if (!file.startsWith(root)) {
    res.writeHead(403);
    res.end();
    return;
  }
  fs.readFile(file, async (err, data) => {
    if (!err) {
      res.writeHead(200, {
        "Content-Type": types[path.extname(file)] || "application/octet-stream",
        "Cache-Control": "no-cache"
      });
      res.end(data);
      return;
    }
    if (!rel.startsWith("mes/front/assets/")) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    try {
      const asset = await cdnAsset("/" + rel);
      res.writeHead(asset.status, { "Content-Type": types[path.extname(rel)] || "application/octet-stream" });
      res.end(asset.body);
    } catch (error) {
      res.writeHead(502);
      res.end(String(error && error.message || error));
    }
  });
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") process.exit(0);
  console.error(err);
  process.exit(1);
});

server.listen(port, "127.0.0.1", () => {
  console.log("http://127.0.0.1:" + port + "/");
});
