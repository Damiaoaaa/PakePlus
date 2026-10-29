'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const db = require('./lib/db');

const PUBLIC = path.resolve(__dirname, 'public');
const PORT = Number(process.env.PORT) || 3780;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
};

function send(res, status, body, headers = {}) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
  res.writeHead(status, { 'Content-Length': buf.length, 'Cache-Control': 'no-cache', ...headers });
  res.end(buf);
}

function json(res, status, data) {
  send(res, status, JSON.stringify(data), { 'Content-Type': 'application/json; charset=utf-8' });
}

function csvEscape(value) {
  const text = String(value ?? '').replace(/\r?\n/g, ' / ');
  return /[",]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(headers, rows) {
  return [headers, ...rows].map((row) => row.map(csvEscape).join(',')).join('\r\n');
}

function sendCsv(res, filename, text) {
  send(res, 200, `\uFEFF${text}`, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="export.csv"; filename*=UTF-8''${encodeURIComponent(filename)}`,
  });
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 2_000_000) {
      const error = new Error('INVALID');
      error.code = 'INVALID';
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    const error = new Error('INVALID');
    error.code = 'INVALID';
    error.status = 400;
    throw error;
  }
}

function filtersOf(url) {
  return {
    q: url.searchParams.get('q') || '',
    member: url.searchParams.get('member') || '',
    from: url.searchParams.get('from') || '',
    to: url.searchParams.get('to') || '',
    remain: url.searchParams.get('remain') || '',
  };
}

function orderCsv(lang, rows) {
  const zh = lang !== 'en';
  const headers = zh
    ? ['訂單編號', '日期', '會員編號', '會員姓名', '電話', '項目', '數量', '單價', '金額', '幣別', '備註']
    : ['Order No', 'Date', 'Member No', 'Name', 'Phone', 'Item', 'Qty', 'Unit price', 'Amount', 'Currency', 'Notes'];
  const body = rows.map(({ order, item }) => [
    order.order_no,
    order.order_date,
    order.member_no,
    order.member_name,
    order.phone,
    item ? (zh ? item.description_zh : item.description_en) : (zh ? order.summary_zh : order.summary_en),
    item ? item.quantity : '',
    item ? item.unit_price : '',
    item ? item.amount : order.total,
    order.currency,
    order.notes,
  ]);
  return toCsv(headers, body);
}

function memberCsv(lang, profile) {
  const zh = lang !== 'en';
  const headers = zh
    ? ['類型', '日期', '單號', '名稱', '數量', '金額', '總次數', '已用', '剩餘', '電話', '備註']
    : ['Type', 'Date', 'Order', 'Name', 'Qty', 'Amount', 'Total', 'Used', 'Left', 'Phone', 'Notes'];
  const rows = [];
  for (const ent of profile.entitlements) {
    rows.push([
      zh ? '餘次' : 'Balance',
      ent.order_date,
      ent.order_no,
      zh ? ent.name_zh : ent.name_en,
      '',
      '',
      ent.total_sessions,
      ent.used_sessions,
      ent.remaining,
      profile.member.phone,
      '',
    ]);
  }
  for (const order of profile.orders) {
    for (const item of order.items) {
      rows.push([
        zh ? '購買' : 'Purchase',
        order.order_date,
        order.order_no,
        zh ? item.description_zh : item.description_en,
        item.quantity,
        item.amount,
        item.sessions ? item.sessions * item.quantity : '',
        '',
        '',
        profile.member.phone,
        order.notes,
      ]);
    }
  }
  return toCsv(headers, rows);
}

function serveStatic(res, pathname) {
  const rel = decodeURIComponent(pathname);
  const safe = rel === '/' ? 'index.html' : rel.replace(/^\/+/, '');
  const file = path.resolve(PUBLIC, safe);
  const relative = path.relative(PUBLIC, file);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    send(res, 403, 'Forbidden', { 'Content-Type': 'text/plain; charset=utf-8' });
    return;
  }
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    send(res, 404, 'Not found', { 'Content-Type': 'text/plain; charset=utf-8' });
    return;
  }
  const ext = path.extname(file).toLowerCase();
  send(res, 200, fs.readFileSync(file), { 'Content-Type': MIME[ext] || 'application/octet-stream' });
}

async function routeApi(req, res, url) {
  const method = req.method;
  const p = url.pathname;
  const lang = url.searchParams.get('lang') === 'en' ? 'en' : 'zh';

  if (method === 'GET' && p === '/api/bootstrap') return json(res, 200, db.bootstrap());
  if (method === 'GET' && p === '/api/dashboard') return json(res, 200, db.dashboard());
  if (method === 'GET' && p === '/api/settings') return json(res, 200, db.getSettings());
  if (method === 'PUT' && p === '/api/settings') return json(res, 200, db.saveSettings(await readBody(req)));
  if (method === 'GET' && p === '/api/backup') {
    const buf = db.createBackup();
    return send(res, 200, buf, {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': 'attachment; filename="salon-backup.sqlite"',
    });
  }

  if (method === 'GET' && p === '/api/categories') return json(res, 200, db.listCategories());
  if (method === 'POST' && p === '/api/categories') return json(res, 200, db.createCategory(await readBody(req)));
  let match = p.match(/^\/api\/categories\/(\d+)$/);
  if (match && method === 'PUT') return json(res, 200, db.updateCategory(Number(match[1]), await readBody(req)));
  if (match && method === 'DELETE') return json(res, 200, db.deleteCategory(Number(match[1])));

  if (method === 'GET' && p === '/api/products') return json(res, 200, db.listProducts());
  if (method === 'POST' && p === '/api/products') return json(res, 200, db.saveProduct(null, await readBody(req)));
  match = p.match(/^\/api\/products\/(\d+)$/);
  if (match && method === 'PUT') return json(res, 200, db.saveProduct(Number(match[1]), await readBody(req)));
  if (match && method === 'DELETE') return json(res, 200, db.deleteProduct(Number(match[1])));

  if (method === 'GET' && p === '/api/packages') return json(res, 200, db.listPackages());
  if (method === 'POST' && p === '/api/packages') return json(res, 200, db.createPackage(await readBody(req)));
  match = p.match(/^\/api\/packages\/(\d+)$/);
  if (match && method === 'GET') {
    const row = db.getPackage(Number(match[1]));
    if (!row) return json(res, 404, { error: 'NOT_FOUND' });
    return json(res, 200, row);
  }
  if (match && method === 'PUT') return json(res, 200, db.updatePackage(Number(match[1]), await readBody(req)));
  if (match && method === 'DELETE') return json(res, 200, db.deletePackage(Number(match[1])));

  if (method === 'GET' && p === '/api/members') return json(res, 200, db.listMembers(filtersOf(url)));
  if (method === 'POST' && p === '/api/members') return json(res, 200, db.createMember(await readBody(req)));
  match = p.match(/^\/api\/members\/(\d+)\/profile$/);
  if (match && method === 'GET') {
    const profile = db.getMemberProfile(Number(match[1]));
    if (!profile) return json(res, 404, { error: 'NOT_FOUND' });
    return json(res, 200, profile);
  }
  match = p.match(/^\/api\/members\/(\d+)\/export\.csv$/);
  if (match && method === 'GET') {
    const profile = db.getMemberProfile(Number(match[1]));
    if (!profile) return json(res, 404, { error: 'NOT_FOUND' });
    const name = `${profile.member.member_no}-${profile.member.name}`.replace(/[\\/:*?"<>|]/g, '');
    return sendCsv(res, `${name}.csv`, memberCsv(lang, profile));
  }
  match = p.match(/^\/api\/members\/(\d+)$/);
  if (match && method === 'GET') {
    const member = db.getMember(Number(match[1]));
    if (!member) return json(res, 404, { error: 'NOT_FOUND' });
    return json(res, 200, member);
  }
  if (match && method === 'PUT') return json(res, 200, db.updateMember(Number(match[1]), await readBody(req)));
  if (match && method === 'DELETE') return json(res, 200, db.deleteMember(Number(match[1])));

  if (method === 'GET' && p === '/api/orders/export.csv') {
    const data = db.exportOrderRows(filtersOf(url));
    return sendCsv(res, lang === 'en' ? 'orders.csv' : '訂單.csv', orderCsv(lang, data.rows));
  }
  if (method === 'GET' && p === '/api/orders') return json(res, 200, db.listOrders(filtersOf(url)));
  if (method === 'POST' && p === '/api/orders') return json(res, 200, db.createOrder(await readBody(req)));
  match = p.match(/^\/api\/orders\/(\d+)$/);
  if (match && method === 'GET') {
    const order = db.getOrder(Number(match[1]));
    if (!order) return json(res, 404, { error: 'NOT_FOUND' });
    return json(res, 200, order);
  }
  if (match && method === 'DELETE') return json(res, 200, db.deleteOrder(Number(match[1])));

  match = p.match(/^\/api\/entitlements\/(\d+)\/use$/);
  if (match && method === 'POST') {
    const body = await readBody(req);
    body.entitlement_id = Number(match[1]);
    return json(res, 200, db.useSessions(body));
  }
  match = p.match(/^\/api\/entitlements\/(\d+)\/adjust$/);
  if (match && method === 'POST') return json(res, 200, db.adjustSessions(Number(match[1]), await readBody(req)));
  match = p.match(/^\/api\/session-logs\/(\d+)\/undo$/);
  if (match && method === 'POST') return json(res, 200, db.undoLog(Number(match[1])));

  if (method === 'GET' && p === '/api/appointments') return json(res, 200, db.listAppointments(filtersOf(url)));
  if (method === 'POST' && p === '/api/appointments') return json(res, 200, db.createAppointment(await readBody(req)));
  match = p.match(/^\/api\/appointments\/(\d+)\/complete$/);
  if (match && method === 'POST') {
    const body = await readBody(req);
    return json(res, 200, db.completeAppointment(Number(match[1]), !(body.redeem === false || body.redeem === 0 || body.redeem === '0')));
  }
  match = p.match(/^\/api\/appointments\/(\d+)\/cancel$/);
  if (match && method === 'POST') return json(res, 200, db.cancelAppointment(Number(match[1])));
  match = p.match(/^\/api\/appointments\/(\d+)$/);
  if (match && method === 'GET') {
    const row = db.getAppointment(Number(match[1]));
    if (!row) return json(res, 404, { error: 'NOT_FOUND' });
    return json(res, 200, row);
  }
  if (match && method === 'PUT') return json(res, 200, db.updateAppointment(Number(match[1]), await readBody(req)));
  if (match && method === 'DELETE') return json(res, 200, db.deleteAppointment(Number(match[1])));

  return json(res, 404, { error: 'NOT_FOUND' });
}

async function handler(req, res) {
  const url = new URL(req.url, 'http://127.0.0.1');
  try {
    if (url.pathname.startsWith('/api/')) {
      await routeApi(req, res, url);
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      send(res, 405, 'Method not allowed', { 'Content-Type': 'text/plain; charset=utf-8' });
      return;
    }
    serveStatic(res, url.pathname);
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error(error);
    if (!res.headersSent) json(res, status, { error: error.code || 'ERROR' });
  }
}

function start(port) {
  const server = http.createServer((req, res) => {
    handler(req, res).catch((error) => {
      console.error(error);
      if (!res.headersSent) json(res, 500, { error: 'ERROR' });
    });
  });
  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE' && port < PORT + 10) {
      start(port + 1);
      return;
    }
    console.error(error);
    process.exit(1);
  });
  server.listen(port, '127.0.0.1', () => {
    const addr = `http://127.0.0.1:${port}/`;
    console.log('');
    console.log('  變MORE髮 會員系統已啟動');
    console.log(`  請在瀏覽器開啟  ${addr}`);
    console.log(`  資料庫  ${db.DB_FILE}`);
    console.log('  關閉此視窗即停止系統，資料會保留在 data 資料夾');
    console.log('');
    if (process.argv.includes('--open')) exec(`cmd /c start "" "${addr}"`);
  });
  return server;
}

let info;
try {
  info = db.init();
} catch (error) {
  console.error('資料庫初始化失敗');
  console.error(error.message || error);
  process.exit(1);
}

if (info.initialized) {
  console.log(info.sqlCreated ? '已建立 init.sql，並初始化本機資料庫。' : '資料庫不存在，已用 init.sql 完成初始化。');
}

start(PORT);
