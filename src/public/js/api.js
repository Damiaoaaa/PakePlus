function csvEscape(value) {
  const text = String(value ?? '').replace(/\r?\n/g, ' / ');
  return /[",]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(headers, rows) {
  return [headers, ...rows].map((row) => row.map(csvEscape).join(',')).join('\r\n');
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

function filtersOf(url) {
  return {
    q: url.searchParams.get('q') || '',
    member: url.searchParams.get('member') || '',
    from: url.searchParams.get('from') || '',
    to: url.searchParams.get('to') || '',
    remain: url.searchParams.get('remain') || '',
  };
}

function saveFile(filename, mime, content) {
  const blob = content instanceof Uint8Array
    ? new Blob([content], { type: mime })
    : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function notFound() {
  const error = new Error('NOT_FOUND');
  error.code = 'NOT_FOUND';
  throw error;
}

function route(method, url, body) {
  const p = url.pathname;
  const lang = url.searchParams.get('lang') === 'en' ? 'en' : 'zh';
  const db = salonDb;

  if (method === 'GET' && p === '/api/bootstrap') return db.bootstrap();
  if (method === 'GET' && p === '/api/dashboard') return db.dashboard();
  if (method === 'GET' && p === '/api/settings') return db.getSettings();
  if (method === 'PUT' && p === '/api/settings') return db.saveSettings(body || {});
  if (method === 'GET' && p === '/api/backup') {
    saveFile('salon-backup.sqlite', 'application/octet-stream', db.createBackup());
    return { ok: true };
  }

  if (method === 'GET' && p === '/api/categories') return db.listCategories();
  if (method === 'POST' && p === '/api/categories') return db.createCategory(body || {});
  let match = p.match(/^\/api\/categories\/(\d+)$/);
  if (match && method === 'PUT') return db.updateCategory(Number(match[1]), body || {});
  if (match && method === 'DELETE') return db.deleteCategory(Number(match[1]));

  if (method === 'GET' && p === '/api/products') return db.listProducts();
  if (method === 'POST' && p === '/api/products') return db.saveProduct(null, body || {});
  match = p.match(/^\/api\/products\/(\d+)$/);
  if (match && method === 'PUT') return db.saveProduct(Number(match[1]), body || {});
  if (match && method === 'DELETE') return db.deleteProduct(Number(match[1]));

  if (method === 'GET' && p === '/api/packages') return db.listPackages();
  if (method === 'POST' && p === '/api/packages') return db.createPackage(body || {});
  match = p.match(/^\/api\/packages\/(\d+)$/);
  if (match && method === 'GET') {
    const row = db.getPackage(Number(match[1]));
    if (!row) notFound();
    return row;
  }
  if (match && method === 'PUT') return db.updatePackage(Number(match[1]), body || {});
  if (match && method === 'DELETE') return db.deletePackage(Number(match[1]));

  if (method === 'GET' && p === '/api/members') return db.listMembers(filtersOf(url));
  if (method === 'POST' && p === '/api/members') return db.createMember(body || {});
  match = p.match(/^\/api\/members\/(\d+)\/profile$/);
  if (match && method === 'GET') {
    const profile = db.getMemberProfile(Number(match[1]));
    if (!profile) notFound();
    return profile;
  }
  match = p.match(/^\/api\/members\/(\d+)\/export\.csv$/);
  if (match && method === 'GET') {
    const profile = db.getMemberProfile(Number(match[1]));
    if (!profile) notFound();
    const name = `${profile.member.member_no}-${profile.member.name}`.replace(/[\\/:*?"<>|]/g, '');
    saveFile(`${name}.csv`, 'text/csv;charset=utf-8', `\uFEFF${memberCsv(lang, profile)}`);
    return { ok: true };
  }
  match = p.match(/^\/api\/members\/(\d+)$/);
  if (match && method === 'GET') {
    const member = db.getMember(Number(match[1]));
    if (!member) notFound();
    return member;
  }
  if (match && method === 'PUT') return db.updateMember(Number(match[1]), body || {});
  if (match && method === 'DELETE') return db.deleteMember(Number(match[1]));

  if (method === 'GET' && p === '/api/orders/export.csv') {
    const data = db.exportOrderRows(filtersOf(url));
    saveFile(lang === 'en' ? 'orders.csv' : '訂單.csv', 'text/csv;charset=utf-8', `\uFEFF${orderCsv(lang, data.rows)}`);
    return { ok: true };
  }
  if (method === 'GET' && p === '/api/orders') return db.listOrders(filtersOf(url));
  if (method === 'POST' && p === '/api/orders') return db.createOrder(body || {});
  match = p.match(/^\/api\/orders\/(\d+)$/);
  if (match && method === 'GET') {
    const order = db.getOrder(Number(match[1]));
    if (!order) notFound();
    return order;
  }
  if (match && method === 'DELETE') return db.deleteOrder(Number(match[1]));

  match = p.match(/^\/api\/entitlements\/(\d+)\/use$/);
  if (match && method === 'POST') {
    const payload = { ...(body || {}), entitlement_id: Number(match[1]) };
    return db.useSessions(payload);
  }
  match = p.match(/^\/api\/entitlements\/(\d+)\/adjust$/);
  if (match && method === 'POST') return db.adjustSessions(Number(match[1]), body || {});
  match = p.match(/^\/api\/session-logs\/(\d+)\/undo$/);
  if (match && method === 'POST') return db.undoLog(Number(match[1]));

  if (method === 'GET' && p === '/api/appointments') return db.listAppointments(filtersOf(url));
  if (method === 'POST' && p === '/api/appointments') return db.createAppointment(body || {});
  match = p.match(/^\/api\/appointments\/(\d+)\/complete$/);
  if (match && method === 'POST') {
    const redeem = !(body && (body.redeem === false || body.redeem === 0 || body.redeem === '0'));
    return db.completeAppointment(Number(match[1]), redeem);
  }
  match = p.match(/^\/api\/appointments\/(\d+)\/cancel$/);
  if (match && method === 'POST') return db.cancelAppointment(Number(match[1]));
  match = p.match(/^\/api\/appointments\/(\d+)$/);
  if (match && method === 'GET') {
    const row = db.getAppointment(Number(match[1]));
    if (!row) notFound();
    return row;
  }
  if (match && method === 'PUT') return db.updateAppointment(Number(match[1]), body || {});
  if (match && method === 'DELETE') return db.deleteAppointment(Number(match[1]));

  notFound();
}

let ready;
function ensureDb() {
  if (!ready) ready = salonDb.init();
  return ready;
}

async function request(method, url, body) {
  await ensureDb();
  let data;
  try {
    data = route(method, new URL(url, 'http://local.app'), body);
  } catch (error) {
    const wrapped = new Error(error?.code || 'ERROR');
    wrapped.code = error?.code || 'ERROR';
    throw wrapped;
  }
  if (method !== 'GET') await salonDb.persist();
  return data;
}

const api = {
  get: (url) => request('GET', url),
  post: (url, body) => request('POST', url, body ?? {}),
  put: (url, body) => request('PUT', url, body ?? {}),
  del: (url) => request('DELETE', url),
};

function downloadUrl(url) {
  request('GET', url).catch((error) => {
    if (typeof showError === 'function') showError(error);
  });
}
