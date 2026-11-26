const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");

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

let cachedDeviceId = "";

function machineGuid() {
  if (cachedDeviceId) return Promise.resolve(cachedDeviceId);
  return new Promise((resolve) => {
    execFile("powershell.exe", [
      "-NoProfile",
      "-Command",
      "(Get-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Cryptography' -Name MachineGuid).MachineGuid"
    ], { windowsHide: true, timeout: 8000 }, (error, stdout) => {
      const match = String(stdout || "").match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);
      if (!match) {
        resolve("");
        return;
      }
      cachedDeviceId = match[0];
      resolve(cachedDeviceId);
    });
  });
}

function deviceCheck(req, res) {
  if (req.method !== "POST") {
    res.writeHead(405, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    res.end(JSON.stringify({ code: 400, msg: "缺少参数" }));
    return;
  }
  const chunks = [];
  let size = 0;
  let tooLarge = false;
  req.on("data", chunk => {
    size += chunk.length;
    if (size > 4096) {
      tooLarge = true;
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });
  req.on("error", () => {
    if (res.headersSent) return;
    res.writeHead(400, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    res.end(JSON.stringify({ code: 400, msg: "缺少参数" }));
  });
  req.on("end", () => {
    if (tooLarge || res.headersSent) return;
    const body = Buffer.concat(chunks);
    const upstream = http.request({
      hostname: "123.56.204.77",
      port: 80,
      path: "/check",
      method: "POST",
      headers: {
        "Content-Type": req.headers["content-type"] || "application/x-www-form-urlencoded",
        "Content-Length": body.length,
        Accept: "application/json"
      },
      timeout: 12000
    }, upstreamRes => {
      const out = [];
      upstreamRes.on("data", chunk => out.push(chunk));
      upstreamRes.on("end", () => {
        if (res.headersSent) return;
        res.writeHead(upstreamRes.statusCode || 502, {
          "Content-Type": upstreamRes.headers["content-type"] || "application/json; charset=utf-8",
          "Cache-Control": "no-store"
        });
        res.end(Buffer.concat(out));
      });
    });
    const fail = () => {
      if (res.headersSent) return;
      res.writeHead(502, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
      res.end(JSON.stringify({ code: 400, msg: "无法连接校验服务，请检查网络" }));
    };
    upstream.on("timeout", () => upstream.destroy());
    upstream.on("error", fail);
    upstream.end(body);
  });
}

const server = http.createServer((req, res) => {
  const urlPath = (req.url || "/").split("?")[0];
  if (urlPath === "/device-id") {
    machineGuid().then((uuid) => {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
      res.end(JSON.stringify({ uuid }));
    });
    return;
  }
  if (urlPath === "/device-check") {
    deviceCheck(req, res);
    return;
  }
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
