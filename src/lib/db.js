'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'salon.sqlite');
const SQL_FILE = path.join(DATA_DIR, 'init.sql');

class DbError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

function fail(code, status = 400) {
  throw new DbError(code, status);
}

const INIT_SQL = `-- 變MORE髮 會員系統初始化
-- 若 data/salon.sqlite 不存在，啟動程式時會執行本檔建立並寫入預設資料。

PRAGMA foreign_keys = ON;

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);

CREATE TABLE categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name_zh TEXT NOT NULL,
  name_en TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER,
  name_zh TEXT NOT NULL,
  name_en TEXT NOT NULL,
  price REAL NOT NULL DEFAULT 0,
  sessions INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  FOREIGN KEY (category_id) REFERENCES categories(id)
);

CREATE TABLE packages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name_zh TEXT NOT NULL,
  name_en TEXT NOT NULL,
  price REAL NOT NULL DEFAULT 0,
  sessions INTEGER NOT NULL DEFAULT 1,
  description_zh TEXT NOT NULL DEFAULT '',
  description_en TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE package_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  package_id INTEGER NOT NULL,
  name_zh TEXT NOT NULL,
  name_en TEXT NOT NULL,
  sessions INTEGER NOT NULL,
  FOREIGN KEY (package_id) REFERENCES packages(id) ON DELETE CASCADE
);

CREATE TABLE members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_no TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  gender TEXT NOT NULL DEFAULT '',
  birthday TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_no TEXT NOT NULL UNIQUE,
  member_id INTEGER NOT NULL,
  order_date TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'HKD',
  total REAL NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  template TEXT NOT NULL DEFAULT 'invoice',
  created_at TEXT NOT NULL,
  FOREIGN KEY (member_id) REFERENCES members(id)
);

CREATE TABLE order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  item_type TEXT NOT NULL,
  ref_id INTEGER,
  description_zh TEXT NOT NULL,
  description_en TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price REAL NOT NULL,
  amount REAL NOT NULL,
  sessions INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

CREATE TABLE entitlements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id INTEGER NOT NULL,
  order_id INTEGER NOT NULL,
  order_item_id INTEGER NOT NULL,
  package_id INTEGER,
  product_id INTEGER,
  name_zh TEXT NOT NULL,
  name_en TEXT NOT NULL,
  total_sessions INTEGER NOT NULL,
  used_sessions INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY (member_id) REFERENCES members(id),
  FOREIGN KEY (order_id) REFERENCES orders(id),
  FOREIGN KEY (order_item_id) REFERENCES order_items(id)
);

CREATE TABLE session_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entitlement_id INTEGER NOT NULL,
  member_id INTEGER NOT NULL,
  appointment_id INTEGER,
  used_on TEXT NOT NULL,
  count INTEGER NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  FOREIGN KEY (entitlement_id) REFERENCES entitlements(id),
  FOREIGN KEY (member_id) REFERENCES members(id)
);

CREATE TABLE appointments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id INTEGER NOT NULL,
  entitlement_id INTEGER,
  appt_date TEXT NOT NULL,
  appt_time TEXT NOT NULL DEFAULT '10:00',
  title_zh TEXT NOT NULL DEFAULT '',
  title_en TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'scheduled',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  FOREIGN KEY (member_id) REFERENCES members(id),
  FOREIGN KEY (entitlement_id) REFERENCES entitlements(id)
);

CREATE INDEX idx_orders_member ON orders(member_id);
CREATE INDEX idx_orders_date ON orders(order_date);
CREATE INDEX idx_items_order ON order_items(order_id);
CREATE INDEX idx_ent_member ON entitlements(member_id);
CREATE INDEX idx_ent_order ON entitlements(order_id);
CREATE INDEX idx_logs_ent ON session_logs(entitlement_id);
CREATE INDEX idx_logs_appt ON session_logs(appointment_id);
CREATE INDEX idx_appt_date ON appointments(appt_date);
CREATE INDEX idx_appt_member ON appointments(member_id);

INSERT INTO settings (key, value) VALUES
('company_name', '變MORE髮'),
('company_name_en', 'BIAN MORE HAIR'),
('address', 'Room 2001, Sterling Center, 11 Cheung Yue Street, HONGKONG.'),
('phone', ''),
('currency', 'HKD'),
('receipt_note_zh', '進口稅不包括在內'),
('receipt_note_en', 'import tax not included'),
('invoice_title_zh', '發票'),
('invoice_title_en', 'Invoice'),
('lang', 'zh');

INSERT INTO categories (id, name_zh, name_en, sort_order, created_at) VALUES
(1, '剪髮造型', 'Cut & Style', 1, datetime('now','localtime')),
(2, '染燙造型', 'Colour & Perm', 2, datetime('now','localtime')),
(3, '護髮修護', 'Hair Treatment', 3, datetime('now','localtime')),
(4, '頭皮護理', 'Scalp Care', 4, datetime('now','localtime')),
(5, '面部美容', 'Facial', 5, datetime('now','localtime')),
(6, '產品零售', 'Retail', 6, datetime('now','localtime'));

INSERT INTO products (id, category_id, name_zh, name_en, price, sessions, active, created_at) VALUES
(1, 1, '女士剪髮', 'Ladies haircut', 480, 1, 1, datetime('now','localtime')),
(2, 1, '男士剪髮', 'Men haircut', 280, 1, 1, datetime('now','localtime')),
(3, 2, '短髮染髮', 'Short hair colour', 1280, 1, 1, datetime('now','localtime')),
(4, 2, '長髮染髮', 'Long hair colour', 1680, 1, 1, datetime('now','localtime')),
(5, 2, '電髮', 'Perm', 1880, 1, 1, datetime('now','localtime')),
(6, 3, '深層護髮', 'Deep treatment', 680, 1, 1, datetime('now','localtime')),
(7, 3, '結構修復', 'Bond repair', 980, 1, 1, datetime('now','localtime')),
(8, 4, '頭皮養護', 'Scalp treatment', 880, 1, 1, datetime('now','localtime')),
(9, 5, '保濕面部護理', 'Hydrating facial', 780, 1, 1, datetime('now','localtime')),
(10, 5, '精華導入', 'Essence infusion', 1080, 1, 1, datetime('now','localtime')),
(11, 6, '家居護髮膜', 'Home hair mask', 280, 0, 1, datetime('now','localtime')),
(12, 6, '頭皮精華', 'Scalp serum', 320, 0, 1, datetime('now','localtime'));

INSERT INTO packages (id, name_zh, name_en, price, sessions, description_zh, description_en, active, created_at) VALUES
(1, '深層護髮十次套餐', 'Deep treatment 10-visit package', 5800, 10, '可分十次預約，每次含洗髮與深層修護。', 'Redeem across ten visits. Each visit includes wash and deep repair.', 1, datetime('now','localtime')),
(2, '頭皮養護八次套餐', 'Scalp care 8-visit package', 5980, 8, '可分八次預約使用。', 'Redeem across eight visits.', 1, datetime('now','localtime')),
(3, '面部護理六次套餐', 'Facial 6-visit package', 3980, 6, '可分六次預約使用。', 'Redeem across six visits.', 1, datetime('now','localtime')),
(4, '剪髮十二次年卡', 'Haircut 12-visit card', 4680, 12, '十二次剪髮，按會員紀錄扣次。', 'Twelve haircuts, redeemed from the membership record.', 1, datetime('now','localtime')),
(5, '全方位變髮套餐', 'Complete transformation package', 8800, 10, '含深層護髮 6 次及面部護理 4 次，可分次使用。', 'Includes 6 deep treatments and 4 facials. Redeem across separate visits.', 1, datetime('now','localtime'));

INSERT INTO package_items (package_id, name_zh, name_en, sessions) VALUES
(5, '深層護髮', 'Deep treatment', 6),
(5, '面部護理', 'Facial', 4);
`;

let db;

function all(sql, ...params) {
  return db.prepare(sql).all(...params).map((row) => ({ ...row }));
}

function get(sql, ...params) {
  const row = db.prepare(sql).get(...params);
  return row ? { ...row } : null;
}

function run(sql, ...params) {
  return db.prepare(sql).run(...params);
}

function insert(sql, ...params) {
  return Number(run(sql, ...params).lastInsertRowid);
}

function tx(fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch { /* already rolled back */ }
    throw error;
  }
}

function nowLocal() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function today() {
  return nowLocal().slice(0, 10);
}

function clip(value, max) {
  return String(value ?? '').trim().slice(0, max);
}

function mustName(zh, en, max = 80) {
  let a = clip(zh, max);
  let b = clip(en, max);
  if (!a && !b) fail('NAME_REQUIRED');
  if (!a) a = b;
  if (!b) b = a;
  return [a, b];
}

function num(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) fail('INVALID');
  return Math.round(n * 100) / 100;
}

function int(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    if (fallback !== undefined) return fallback;
    fail('INVALID');
  }
  return Math.round(n);
}

function nonNeg(value) {
  const n = num(value);
  if (n < 0 || n > 10000000) fail('INVALID');
  return n;
}

function fromCents(cents) {
  return Math.round(cents) / 100;
}

function like(q) {
  const s = String(q || '').trim().replace(/[\\%_]/g, (ch) => `\\${ch}`);
  return s ? `%${s}%` : '';
}

function withRemaining(ent) {
  if (!ent) return ent;
  return { ...ent, remaining: ent.total_sessions - ent.used_sessions };
}

function removeDbFiles() {
  for (const file of [DB_FILE, `${DB_FILE}-wal`, `${DB_FILE}-shm`]) {
    try { fs.unlinkSync(file); } catch { /* missing */ }
  }
}

function init() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  let sqlCreated = false;
  if (!fs.existsSync(SQL_FILE)) {
    fs.writeFileSync(SQL_FILE, INIT_SQL, 'utf8');
    sqlCreated = true;
  }
  const dbCreated = !fs.existsSync(DB_FILE);
  db = new DatabaseSync(DB_FILE);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 4000');
  db.exec('PRAGMA journal_mode = WAL');
  const exists = get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'members'");
  let initialized = false;
  if (!exists) {
    try {
      db.exec(fs.readFileSync(SQL_FILE, 'utf8'));
      initialized = true;
    } catch (error) {
      try { db.close(); } catch { /* ignore */ }
      removeDbFiles();
      db = null;
      error.code = error.code || 'INIT_FAILED';
      throw error;
    }
  }
  return { dbCreated, sqlCreated, initialized, dbFile: DB_FILE, sqlFile: SQL_FILE };
}

function getSettings() {
  const rows = all('SELECT key, value FROM settings');
  const settings = {};
  for (const row of rows) settings[row.key] = row.value;
  return settings;
}

function saveSettings(patch) {
  const allowed = {
    company_name: 80,
    company_name_en: 80,
    address: 300,
    phone: 40,
    currency: 3,
    receipt_note_zh: 300,
    receipt_note_en: 300,
    invoice_title_zh: 40,
    invoice_title_en: 40,
    lang: 8,
  };
  tx(() => {
    const stmt = `INSERT INTO settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value`;
    for (const [key, max] of Object.entries(allowed)) {
      if (!(key in patch)) continue;
      let value = clip(patch[key], max);
      if (key === 'currency') {
        value = value.toUpperCase();
        if (!/^[A-Z]{3}$/.test(value)) fail('INVALID');
      }
      if (key === 'lang') value = value === 'en' ? 'en' : 'zh';
      run(stmt, key, value);
    }
  });
  return getSettings();
}

function bootstrap() {
  return {
    settings: getSettings(),
    counts: {
      members: get('SELECT COUNT(*) AS c FROM members').c,
      packages: get('SELECT COUNT(*) AS c FROM packages').c,
      products: get('SELECT COUNT(*) AS c FROM products').c,
    },
  };
}

function dashboard() {
  const settings = getSettings();
  const day = today();
  const month = day.slice(0, 7);
  const currency = settings.currency || 'HKD';
  return {
    members: get('SELECT COUNT(*) AS c FROM members').c,
    packages: get('SELECT COUNT(*) AS c FROM packages WHERE active = 1').c,
    month_total: get(
      `SELECT COALESCE(SUM(total), 0) AS s FROM orders WHERE substr(order_date, 1, 7) = ? AND currency = ?`,
      month,
      currency
    ).s,
    currency,
    appointments_today: get(
      `SELECT COUNT(*) AS c FROM appointments WHERE appt_date = ? AND status != 'cancelled'`,
      day
    ).c,
    remaining_sessions: get(
      'SELECT COALESCE(SUM(total_sessions - used_sessions), 0) AS s FROM entitlements'
    ).s,
    today_appointments: all(
      `SELECT a.*, m.name AS member_name, m.phone AS member_phone
       FROM appointments a JOIN members m ON m.id = a.member_id
       WHERE a.appt_date = ? AND a.status != 'cancelled'
       ORDER BY a.appt_time, a.id`,
      day
    ),
    low: all(
      `SELECT e.*, m.name AS member_name, (e.total_sessions - e.used_sessions) AS remaining
       FROM entitlements e JOIN members m ON m.id = e.member_id
       WHERE e.total_sessions - e.used_sessions BETWEEN 1 AND 2
       ORDER BY remaining, e.id DESC LIMIT 8`
    ).map(withRemaining),
    recent_orders: all(
      `SELECT o.id, o.order_no, o.order_date, o.total, o.currency, m.name AS member_name, m.id AS member_id,
        (SELECT group_concat(description_zh, ' · ') FROM order_items WHERE order_id = o.id) AS summary_zh,
        (SELECT group_concat(description_en, ' · ') FROM order_items WHERE order_id = o.id) AS summary_en
       FROM orders o JOIN members m ON m.id = o.member_id
       ORDER BY o.id DESC LIMIT 6`
    ),
  };
}

function listCategories() {
  return all('SELECT * FROM categories ORDER BY sort_order, id');
}

function createCategory(body) {
  const [zh, en] = mustName(body.name_zh, body.name_en);
  const max = get('SELECT COALESCE(MAX(sort_order), 0) AS n FROM categories').n;
  const id = insert(
    'INSERT INTO categories (name_zh, name_en, sort_order, created_at) VALUES (?,?,?,?)',
    zh, en, max + 1, nowLocal()
  );
  return get('SELECT * FROM categories WHERE id = ?', id);
}

function updateCategory(id, body) {
  const current = get('SELECT * FROM categories WHERE id = ?', id);
  if (!current) fail('NOT_FOUND', 404);
  const [zh, en] = mustName(body.name_zh, body.name_en);
  run('UPDATE categories SET name_zh = ?, name_en = ? WHERE id = ?', zh, en, id);
  return get('SELECT * FROM categories WHERE id = ?', id);
}

function deleteCategory(id) {
  const current = get('SELECT * FROM categories WHERE id = ?', id);
  if (!current) fail('NOT_FOUND', 404);
  const used = get('SELECT COUNT(*) AS c FROM products WHERE category_id = ?', id);
  if (used.c > 0) fail('CAT_HAS_PRODUCTS');
  run('DELETE FROM categories WHERE id = ?', id);
  return { ok: true };
}

function listProducts() {
  return all(
    `SELECT p.*, c.name_zh AS category_name_zh, c.name_en AS category_name_en
     FROM products p LEFT JOIN categories c ON c.id = p.category_id
     ORDER BY p.active DESC, c.sort_order, p.id`
  );
}

function saveProduct(id, body) {
  const [zh, en] = mustName(body.name_zh, body.name_en);
  const price = nonNeg(body.price ?? 0);
  const sessions = int(body.sessions, 0);
  if (sessions < 0 || sessions > 999) fail('INVALID');
  let categoryId = body.category_id ? int(body.category_id) : null;
  if (categoryId) {
    const category = get('SELECT id FROM categories WHERE id = ?', categoryId);
    if (!category) fail('INVALID');
  } else categoryId = null;
  const active = body.active === 0 || body.active === '0' || body.active === false ? 0 : 1;
  if (id) {
    const current = get('SELECT * FROM products WHERE id = ?', id);
    if (!current) fail('NOT_FOUND', 404);
    run(
      `UPDATE products SET category_id = ?, name_zh = ?, name_en = ?, price = ?, sessions = ?, active = ? WHERE id = ?`,
      categoryId, zh, en, price, sessions, active, id
    );
    return get('SELECT * FROM products WHERE id = ?', id);
  }
  const newId = insert(
    `INSERT INTO products (category_id, name_zh, name_en, price, sessions, active, created_at)
     VALUES (?,?,?,?,?,?,?)`,
    categoryId, zh, en, price, sessions, active, nowLocal()
  );
  return get('SELECT * FROM products WHERE id = ?', newId);
}

function deleteProduct(id) {
  const current = get('SELECT * FROM products WHERE id = ?', id);
  if (!current) fail('NOT_FOUND', 404);
  const used = get(`SELECT COUNT(*) AS c FROM order_items WHERE item_type = 'product' AND ref_id = ?`, id);
  if (used.c > 0) {
    run('UPDATE products SET active = 0 WHERE id = ?', id);
    return { ok: true, deactivated: true };
  }
  run('DELETE FROM products WHERE id = ?', id);
  return { ok: true, deactivated: false };
}

function attachPackageItems(rows) {
  const items = all('SELECT * FROM package_items ORDER BY id');
  const by = new Map();
  for (const item of items) {
    if (!by.has(item.package_id)) by.set(item.package_id, []);
    by.get(item.package_id).push(item);
  }
  return rows.map((row) => ({ ...row, items: by.get(row.id) || [] }));
}

function listPackages() {
  return attachPackageItems(all('SELECT * FROM packages ORDER BY active DESC, id DESC'));
}

function getPackage(id) {
  const row = get('SELECT * FROM packages WHERE id = ?', id);
  if (!row) return null;
  row.items = all('SELECT * FROM package_items WHERE package_id = ? ORDER BY id', id);
  return row;
}

function normalizeItems(items) {
  if (!Array.isArray(items)) return [];
  const out = [];
  for (const item of items) {
    const zh = clip(item.name_zh, 80);
    const en = clip(item.name_en, 80);
    if (!zh && !en) continue;
    const sessions = int(item.sessions);
    if (sessions < 1 || sessions > 999) fail('INVALID');
    out.push({ name_zh: zh || en, name_en: en || zh, sessions });
  }
  return out;
}

function createPackage(body) {
  const [zh, en] = mustName(body.name_zh, body.name_en);
  const price = nonNeg(body.price ?? 0);
  const items = normalizeItems(body.items);
  const sessions = items.length ? items.reduce((sum, item) => sum + item.sessions, 0) : int(body.sessions);
  if (sessions < 1 || sessions > 9999) fail('INVALID');
  const active = body.active === 0 || body.active === '0' || body.active === false ? 0 : 1;
  const id = tx(() => {
    const packageId = insert(
      `INSERT INTO packages (name_zh, name_en, price, sessions, description_zh, description_en, active, created_at)
       VALUES (?,?,?,?,?,?,?,?)`,
      zh, en, price, sessions, clip(body.description_zh, 1000), clip(body.description_en, 1000), active, nowLocal()
    );
    for (const item of items) {
      run(
        'INSERT INTO package_items (package_id, name_zh, name_en, sessions) VALUES (?,?,?,?)',
        packageId, item.name_zh, item.name_en, item.sessions
      );
    }
    return packageId;
  });
  return getPackage(id);
}

function updatePackage(id, body) {
  const current = get('SELECT * FROM packages WHERE id = ?', id);
  if (!current) fail('NOT_FOUND', 404);
  const [zh, en] = mustName(body.name_zh, body.name_en);
  const price = nonNeg(body.price ?? 0);
  const items = normalizeItems(body.items);
  const sessions = items.length ? items.reduce((sum, item) => sum + item.sessions, 0) : int(body.sessions);
  if (sessions < 1 || sessions > 9999) fail('INVALID');
  const active = body.active === 0 || body.active === '0' || body.active === false ? 0 : 1;
  tx(() => {
    run(
      `UPDATE packages SET name_zh=?, name_en=?, price=?, sessions=?, description_zh=?, description_en=?, active=? WHERE id=?`,
      zh, en, price, sessions, clip(body.description_zh, 1000), clip(body.description_en, 1000), active, id
    );
    run('DELETE FROM package_items WHERE package_id = ?', id);
    for (const item of items) {
      run(
        'INSERT INTO package_items (package_id, name_zh, name_en, sessions) VALUES (?,?,?,?)',
        id, item.name_zh, item.name_en, item.sessions
      );
    }
  });
  return getPackage(id);
}

function deletePackage(id) {
  const current = get('SELECT * FROM packages WHERE id = ?', id);
  if (!current) fail('NOT_FOUND', 404);
  const used = get(
    `SELECT
      (SELECT COUNT(*) FROM order_items WHERE item_type = 'package' AND ref_id = ?) +
      (SELECT COUNT(*) FROM entitlements WHERE package_id = ?) AS c`,
    id, id
  );
  if (used.c > 0) {
    run('UPDATE packages SET active = 0 WHERE id = ?', id);
    return { ok: true, deactivated: true };
  }
  run('DELETE FROM packages WHERE id = ?', id);
  return { ok: true, deactivated: false };
}

function listMembers(filters = {}) {
  const where = [];
  const params = [];
  const q = like(filters.q);
  if (q) {
    where.push(`(m.name LIKE ? ESCAPE '\\' OR m.phone LIKE ? ESCAPE '\\' OR m.member_no LIKE ? ESCAPE '\\' OR m.email LIKE ? ESCAPE '\\')`);
    params.push(q, q, q, q);
  }
  if (String(filters.remain) === '1') {
    where.push('m.id IN (SELECT member_id FROM entitlements WHERE used_sessions < total_sessions)');
  }
  return all(
    `SELECT m.*,
      (SELECT COUNT(*) FROM orders o WHERE o.member_id = m.id) AS order_count,
      (SELECT COALESCE(SUM(total_sessions - used_sessions), 0) FROM entitlements e WHERE e.member_id = m.id) AS remaining,
      (SELECT COALESCE(SUM(total_sessions), 0) FROM entitlements e WHERE e.member_id = m.id) AS total_sessions,
      (SELECT group_concat(name_zh || ' ' || (total_sessions - used_sessions) || '/' || total_sessions, ' · ')
         FROM entitlements e WHERE e.member_id = m.id AND e.used_sessions < e.total_sessions) AS summary_zh,
      (SELECT group_concat(name_en || ' ' || (total_sessions - used_sessions) || '/' || total_sessions, ' · ')
         FROM entitlements e WHERE e.member_id = m.id AND e.used_sessions < e.total_sessions) AS summary_en
     FROM members m
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY m.id DESC`,
    ...params
  );
}

function getMember(id) {
  return get('SELECT * FROM members WHERE id = ?', id);
}

function memberPayload(body) {
  const name = clip(body.name, 80);
  if (!name) fail('NAME_REQUIRED');
  const gender = ['male', 'female', 'other'].includes(body.gender) ? body.gender : '';
  const birthday = /^\d{4}-\d{2}-\d{2}$/.test(String(body.birthday || '')) ? body.birthday : '';
  return {
    name,
    phone: clip(body.phone, 40),
    email: clip(body.email, 120),
    gender,
    birthday,
    address: clip(body.address, 500),
    notes: clip(body.notes, 2000),
  };
}

function createMember(body) {
  const data = memberPayload(body);
  const id = tx(() => {
    const rows = all('SELECT member_no FROM members');
    let maxNo = 0;
    for (const row of rows) {
      const n = parseInt(String(row.member_no).replace(/\D/g, ''), 10);
      if (n > maxNo) maxNo = n;
    }
    const memberNo = `M${String(maxNo + 1).padStart(4, '0')}`;
    return insert(
      `INSERT INTO members (member_no, name, phone, email, gender, birthday, address, notes, created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      memberNo, data.name, data.phone, data.email, data.gender, data.birthday, data.address, data.notes, nowLocal()
    );
  });
  return getMember(id);
}

function updateMember(id, body) {
  const current = getMember(id);
  if (!current) fail('NOT_FOUND', 404);
  const data = memberPayload(body);
  run(
    `UPDATE members SET name=?, phone=?, email=?, gender=?, birthday=?, address=?, notes=? WHERE id=?`,
    data.name, data.phone, data.email, data.gender, data.birthday, data.address, data.notes, id
  );
  return getMember(id);
}

function deleteMember(id) {
  const current = getMember(id);
  if (!current) fail('NOT_FOUND', 404);
  const orders = get('SELECT COUNT(*) AS c FROM orders WHERE member_id = ?', id);
  if (orders.c > 0) fail('MEMBER_HAS_ORDERS');
  tx(() => {
    run('DELETE FROM session_logs WHERE member_id = ?', id);
    run('DELETE FROM appointments WHERE member_id = ?', id);
    run('DELETE FROM members WHERE id = ?', id);
  });
  return { ok: true };
}

function getMemberProfile(id) {
  const member = getMember(id);
  if (!member) return null;
  const entitlements = all(
    `SELECT e.*, o.order_no, o.order_date, o.currency
     FROM entitlements e JOIN orders o ON o.id = e.order_id
     WHERE e.member_id = ?
     ORDER BY (e.used_sessions < e.total_sessions) DESC, e.id DESC`,
    id
  ).map(withRemaining);
  const orders = all(
    `SELECT o.*,
      (SELECT group_concat(description_zh, ' · ') FROM order_items WHERE order_id = o.id) AS summary_zh,
      (SELECT group_concat(description_en, ' · ') FROM order_items WHERE order_id = o.id) AS summary_en
     FROM orders o WHERE o.member_id = ? ORDER BY o.order_date DESC, o.id DESC`,
    id
  );
  const items = all(
    `SELECT oi.* FROM order_items oi JOIN orders o ON o.id = oi.order_id
     WHERE o.member_id = ? ORDER BY oi.id`,
    id
  );
  const byOrder = new Map();
  for (const item of items) {
    if (!byOrder.has(item.order_id)) byOrder.set(item.order_id, []);
    byOrder.get(item.order_id).push(item);
  }
  for (const order of orders) order.items = byOrder.get(order.id) || [];
  const appointments = all(
    `SELECT a.*, e.name_zh AS ent_name_zh, e.name_en AS ent_name_en
     FROM appointments a LEFT JOIN entitlements e ON e.id = a.entitlement_id
     WHERE a.member_id = ? ORDER BY a.appt_date DESC, a.appt_time DESC`,
    id
  );
  const logs = all(
    `SELECT l.*, e.name_zh, e.name_en
     FROM session_logs l JOIN entitlements e ON e.id = l.entitlement_id
     WHERE l.member_id = ? ORDER BY l.id DESC LIMIT 80`,
    id
  );
  return { member, entitlements, orders, appointments, logs };
}

function listOrders(filters = {}) {
  const where = [];
  const params = [];
  if (filters.member) {
    where.push('o.member_id = ?');
    params.push(Number(filters.member));
  }
  if (filters.from && /^\d{4}-\d{2}-\d{2}$/.test(filters.from)) {
    where.push('o.order_date >= ?');
    params.push(filters.from);
  }
  if (filters.to && /^\d{4}-\d{2}-\d{2}$/.test(filters.to)) {
    where.push('o.order_date <= ?');
    params.push(filters.to);
  }
  const q = like(filters.q);
  if (q) {
    where.push(`(
      o.order_no LIKE ? ESCAPE '\\'
      OR m.name LIKE ? ESCAPE '\\'
      OR m.phone LIKE ? ESCAPE '\\'
      OR m.member_no LIKE ? ESCAPE '\\'
      OR o.id IN (
        SELECT order_id FROM order_items
        WHERE description_zh LIKE ? ESCAPE '\\' OR description_en LIKE ? ESCAPE '\\'
      )
    )`);
    params.push(q, q, q, q, q, q);
  }
  const orders = all(
    `SELECT o.*, m.name AS member_name, m.member_no, m.phone,
      (SELECT group_concat(description_zh, ' · ') FROM order_items oi WHERE oi.order_id = o.id) AS summary_zh,
      (SELECT group_concat(description_en, ' · ') FROM order_items oi WHERE oi.order_id = o.id) AS summary_en
     FROM orders o JOIN members m ON m.id = o.member_id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY o.order_date DESC, o.id DESC`,
    ...params
  );
  let member = null;
  if (filters.member) {
    member = get('SELECT id, member_no, name, phone FROM members WHERE id = ?', Number(filters.member));
  }
  return { orders, member };
}

function getOrder(id) {
  const order = get(
    `SELECT o.*, m.name AS member_name, m.member_no, m.phone, m.email, m.address, m.gender
     FROM orders o JOIN members m ON m.id = o.member_id WHERE o.id = ?`,
    id
  );
  if (!order) return null;
  order.items = all('SELECT * FROM order_items WHERE order_id = ? ORDER BY id', id);
  order.entitlements = all('SELECT * FROM entitlements WHERE order_id = ? ORDER BY id', id).map(withRemaining);
  return order;
}

function nextOrderNo(date) {
  const prefix = `BM-${date.replaceAll('-', '')}-`;
  const row = get(
    'SELECT order_no FROM orders WHERE order_no LIKE ? ORDER BY order_no DESC LIMIT 1',
    `${prefix}%`
  );
  const next = row ? (parseInt(row.order_no.slice(prefix.length), 10) || 0) + 1 : 1;
  return prefix + String(next).padStart(3, '0');
}

function packageText(pkg, items) {
  if (items.length) {
    return {
      zh: `${pkg.name_zh}\n${items.map((item) => `${item.name_zh} ×${item.sessions}`).join('、')}`,
      en: `${pkg.name_en}\n${items.map((item) => `${item.name_en} x${item.sessions}`).join(', ')}`,
    };
  }
  return {
    zh: `${pkg.name_zh}\n（含 ${pkg.sessions} 次）`,
    en: `${pkg.name_en}\n(includes ${pkg.sessions} sessions)`,
  };
}

function buildItem(raw) {
  const type = raw.item_type;
  const quantity = int(raw.quantity);
  if (quantity < 1 || quantity > 999) fail('INVALID');
  const hasPrice = raw.unit_price !== undefined && raw.unit_price !== null && raw.unit_price !== '';
  if (type === 'package') {
    const pkg = getPackage(int(raw.ref_id));
    if (!pkg) fail('INVALID');
    const text = packageText(pkg, pkg.items);
    const unit = hasPrice ? nonNeg(raw.unit_price) : pkg.price;
    const grants = pkg.items.length
      ? pkg.items.map((item) => ({
        name_zh: item.name_zh,
        name_en: item.name_en,
        sessions: item.sessions,
        package_id: pkg.id,
        product_id: null,
      }))
      : [{
        name_zh: pkg.name_zh,
        name_en: pkg.name_en,
        sessions: pkg.sessions,
        package_id: pkg.id,
        product_id: null,
      }];
    return {
      type,
      refId: pkg.id,
      zh: clip(raw.description_zh, 1000) || text.zh,
      en: clip(raw.description_en, 1000) || text.en,
      quantity,
      unitCents: Math.round(unit * 100),
      sessionsEach: grants.reduce((sum, grant) => sum + grant.sessions, 0),
      grants,
    };
  }
  if (type === 'product') {
    const product = get('SELECT * FROM products WHERE id = ?', int(raw.ref_id));
    if (!product) fail('INVALID');
    const unit = hasPrice ? nonNeg(raw.unit_price) : product.price;
    const zh = clip(raw.description_zh, 1000) || (product.sessions > 0 ? `${product.name_zh}\n（含 ${product.sessions} 次）` : product.name_zh);
    const en = clip(raw.description_en, 1000) || (product.sessions > 0 ? `${product.name_en}\n(includes ${product.sessions} sessions)` : product.name_en);
    const grants = product.sessions > 0
      ? [{ name_zh: product.name_zh, name_en: product.name_en, sessions: product.sessions, package_id: null, product_id: product.id }]
      : [];
    return {
      type,
      refId: product.id,
      zh,
      en,
      quantity,
      unitCents: Math.round(unit * 100),
      sessionsEach: product.sessions,
      grants,
    };
  }
  if (type === 'custom') {
    const [zh, en] = mustName(raw.description_zh, raw.description_en, 1000);
    const sessions = int(raw.sessions, 0);
    if (sessions < 0 || sessions > 999) fail('INVALID');
    const grants = sessions > 0
      ? [{
        name_zh: zh.split('\n')[0].slice(0, 80),
        name_en: en.split('\n')[0].slice(0, 80),
        sessions,
        package_id: null,
        product_id: null,
      }]
      : [];
    return {
      type,
      refId: null,
      zh,
      en,
      quantity,
      unitCents: Math.round(nonNeg(raw.unit_price ?? 0) * 100),
      sessionsEach: sessions,
      grants,
    };
  }
  fail('INVALID');
}

function createOrder(body) {
  const memberId = int(body.member_id);
  const member = getMember(memberId);
  if (!member) fail('MEMBER_REQUIRED');
  const orderDate = String(body.order_date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(orderDate)) fail('INVALID');
  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) fail('ITEM_REQUIRED');
  const settings = getSettings();
  let currency = clip(body.currency || settings.currency || 'HKD', 3).toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) currency = settings.currency || 'HKD';
  const template = body.template === 'compact' ? 'compact' : 'invoice';
  const notes = clip(body.notes, 2000);
  const now = nowLocal();
  const orderId = tx(() => {
    const id = insert(
      `INSERT INTO orders (order_no, member_id, order_date, currency, total, notes, template, created_at)
       VALUES (?,?,?,?,?,?,?,?)`,
      nextOrderNo(orderDate), memberId, orderDate, currency, 0, notes, template, now
    );
    let totalCents = 0;
    for (const raw of items) {
      const built = buildItem(raw);
      const amountCents = built.unitCents * built.quantity;
      totalCents += amountCents;
      const itemId = insert(
        `INSERT INTO order_items (order_id, item_type, ref_id, description_zh, description_en, quantity, unit_price, amount, sessions)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        id, built.type, built.refId, built.zh, built.en, built.quantity,
        fromCents(built.unitCents), fromCents(amountCents), built.sessionsEach
      );
      for (const grant of built.grants) {
        const total = grant.sessions * built.quantity;
        if (total <= 0) continue;
        insert(
          `INSERT INTO entitlements
            (member_id, order_id, order_item_id, package_id, product_id, name_zh, name_en, total_sessions, used_sessions, created_at)
           VALUES (?,?,?,?,?,?,?,?,0,?)`,
          memberId, id, itemId, grant.package_id, grant.product_id, grant.name_zh, grant.name_en, total, now
        );
      }
    }
    run('UPDATE orders SET total = ? WHERE id = ?', fromCents(totalCents), id);
    return id;
  });
  return getOrder(orderId);
}

function deleteOrder(id) {
  const order = get('SELECT * FROM orders WHERE id = ?', id);
  if (!order) fail('NOT_FOUND', 404);
  const used = get('SELECT COALESCE(SUM(used_sessions), 0) AS u FROM entitlements WHERE order_id = ?', id);
  if (used.u > 0) fail('ORDER_USED');
  tx(() => {
    run(
      `UPDATE appointments SET entitlement_id = NULL
       WHERE entitlement_id IN (SELECT id FROM entitlements WHERE order_id = ?)`,
      id
    );
    run(
      `DELETE FROM session_logs WHERE entitlement_id IN (SELECT id FROM entitlements WHERE order_id = ?)`,
      id
    );
    run('DELETE FROM entitlements WHERE order_id = ?', id);
    run('DELETE FROM order_items WHERE order_id = ?', id);
    run('DELETE FROM orders WHERE id = ?', id);
  });
  return { ok: true };
}

function exportOrderRows(filters) {
  const { orders, member } = listOrders(filters);
  const rows = [];
  for (const order of orders) {
    const items = all('SELECT * FROM order_items WHERE order_id = ? ORDER BY id', order.id);
    if (!items.length) rows.push({ order, item: null });
    for (const item of items) rows.push({ order, item });
  }
  return { rows, member };
}

function applySessionUse(entitlementId, count, usedOn, notes, appointmentId) {
  const ent = get('SELECT * FROM entitlements WHERE id = ?', entitlementId);
  if (!ent) fail('NOT_FOUND', 404);
  const n = int(count);
  if (n < 1) fail('INVALID');
  if (n > ent.total_sessions - ent.used_sessions) fail('SESSIONS_EXCEEDED');
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(usedOn || '')) ? usedOn : today();
  if (appointmentId) {
    const dup = get('SELECT id FROM session_logs WHERE appointment_id = ?', appointmentId);
    if (dup) fail('INVALID');
  }
  const logId = insert(
    `INSERT INTO session_logs (entitlement_id, member_id, appointment_id, used_on, count, notes, created_at)
     VALUES (?,?,?,?,?,?,?)`,
    ent.id, ent.member_id, appointmentId || null, date, n, clip(notes, 500), nowLocal()
  );
  run('UPDATE entitlements SET used_sessions = used_sessions + ? WHERE id = ?', n, ent.id);
  return logId;
}

function useSessions(body) {
  return tx(() => {
    const logId = applySessionUse(int(body.entitlement_id), body.count ?? 1, body.used_on, body.notes, body.appointment_id || null);
    const log = get('SELECT * FROM session_logs WHERE id = ?', logId);
    const entitlement = withRemaining(get('SELECT * FROM entitlements WHERE id = ?', log.entitlement_id));
    const sum = get(
      'SELECT COALESCE(SUM(total_sessions - used_sessions), 0) AS remaining FROM entitlements WHERE member_id = ?',
      entitlement.member_id
    );
    return { entitlement, log_id: logId, remaining: sum.remaining };
  });
}

function adjustSessions(id, body) {
  return tx(() => {
    const ent = get('SELECT * FROM entitlements WHERE id = ?', id);
    if (!ent) fail('NOT_FOUND', 404);
    const used = int(body.used_sessions);
    if (used < 0 || used > ent.total_sessions) fail('INVALID');
    const notes = clip(body.notes, 500);
    if (!notes) fail('REASON_REQUIRED');
    const delta = used - ent.used_sessions;
    if (delta !== 0) {
      insert(
        `INSERT INTO session_logs (entitlement_id, member_id, appointment_id, used_on, count, notes, created_at)
         VALUES (?,?,NULL,?,?,?,?)`,
        ent.id, ent.member_id, today(), delta, notes, nowLocal()
      );
      run('UPDATE entitlements SET used_sessions = ? WHERE id = ?', used, ent.id);
    }
    return withRemaining(get('SELECT * FROM entitlements WHERE id = ?', ent.id));
  });
}

function undoLog(id) {
  return tx(() => {
    const log = get('SELECT * FROM session_logs WHERE id = ?', id);
    if (!log) fail('NOT_FOUND', 404);
    const ent = get('SELECT * FROM entitlements WHERE id = ?', log.entitlement_id);
    if (!ent) fail('NOT_FOUND', 404);
    const used = ent.used_sessions - log.count;
    if (used < 0 || used > ent.total_sessions) fail('INVALID');
    run('UPDATE entitlements SET used_sessions = ? WHERE id = ?', used, ent.id);
    if (log.appointment_id) {
      run(`UPDATE appointments SET status = 'scheduled' WHERE id = ? AND status = 'completed'`, log.appointment_id);
    }
    run('DELETE FROM session_logs WHERE id = ?', log.id);
    return { ok: true };
  });
}

const APPT_SELECT = `
  SELECT a.*, m.name AS member_name, m.phone AS member_phone, m.member_no,
    e.name_zh AS ent_name_zh, e.name_en AS ent_name_en, e.total_sessions, e.used_sessions
  FROM appointments a
  JOIN members m ON m.id = a.member_id
  LEFT JOIN entitlements e ON e.id = a.entitlement_id
`;

function getAppointment(id) {
  return get(`${APPT_SELECT} WHERE a.id = ?`, id);
}

function listAppointments(filters = {}) {
  const where = [];
  const params = [];
  if (filters.from && /^\d{4}-\d{2}-\d{2}$/.test(filters.from)) {
    where.push('a.appt_date >= ?');
    params.push(filters.from);
  }
  if (filters.to && /^\d{4}-\d{2}-\d{2}$/.test(filters.to)) {
    where.push('a.appt_date <= ?');
    params.push(filters.to);
  }
  if (filters.member) {
    where.push('a.member_id = ?');
    params.push(Number(filters.member));
  }
  return all(
    `${APPT_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY a.appt_date, a.appt_time, a.id`,
    ...params
  );
}

function normTime(value) {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return '10:00';
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return '10:00';
  return `${String(hour).padStart(2, '0')}:${match[2]}`;
}

function appointmentFields(body, current) {
  const memberId = int(body.member_id);
  const member = getMember(memberId);
  if (!member) fail('MEMBER_REQUIRED');
  const date = String(body.appt_date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) fail('INVALID');
  let entId = body.entitlement_id ? int(body.entitlement_id) : null;
  let titleZh = clip(body.title_zh, 120);
  let titleEn = clip(body.title_en, 120);
  if (entId) {
    const ent = get('SELECT * FROM entitlements WHERE id = ? AND member_id = ?', entId, memberId);
    if (!ent) fail('INVALID');
    if (!titleZh) titleZh = ent.name_zh;
    if (!titleEn) titleEn = ent.name_en;
  } else entId = null;
  if (!titleZh && !titleEn) fail('NAME_REQUIRED');
  if (!titleZh) titleZh = titleEn;
  if (!titleEn) titleEn = titleZh;
  if (current && current.status === 'completed' && current.entitlement_id !== entId) fail('INVALID');
  return {
    memberId,
    date,
    time: normTime(body.appt_time),
    entId,
    titleZh,
    titleEn,
    notes: clip(body.notes, 1000),
  };
}

function createAppointment(body) {
  const fields = appointmentFields(body);
  const id = insert(
    `INSERT INTO appointments (member_id, entitlement_id, appt_date, appt_time, title_zh, title_en, status, notes, created_at)
     VALUES (?,?,?,?,?,?, 'scheduled', ?, ?)`,
    fields.memberId, fields.entId, fields.date, fields.time, fields.titleZh, fields.titleEn, fields.notes, nowLocal()
  );
  return getAppointment(id);
}

function updateAppointment(id, body) {
  const current = get('SELECT * FROM appointments WHERE id = ?', id);
  if (!current) fail('NOT_FOUND', 404);
  const fields = appointmentFields(body, current);
  run(
    `UPDATE appointments SET member_id=?, entitlement_id=?, appt_date=?, appt_time=?, title_zh=?, title_en=?, notes=? WHERE id=?`,
    fields.memberId, fields.entId, fields.date, fields.time, fields.titleZh, fields.titleEn, fields.notes, id
  );
  return getAppointment(id);
}

function deleteAppointment(id) {
  const current = get('SELECT * FROM appointments WHERE id = ?', id);
  if (!current) fail('NOT_FOUND', 404);
  tx(() => {
    const log = get('SELECT * FROM session_logs WHERE appointment_id = ?', id);
    if (log) {
      const ent = get('SELECT * FROM entitlements WHERE id = ?', log.entitlement_id);
      if (ent) {
        const used = ent.used_sessions - log.count;
        if (used >= 0 && used <= ent.total_sessions) {
          run('UPDATE entitlements SET used_sessions = ? WHERE id = ?', used, ent.id);
        }
      }
      run('DELETE FROM session_logs WHERE id = ?', log.id);
    }
    run('DELETE FROM appointments WHERE id = ?', id);
  });
  return { ok: true };
}

function completeAppointment(id, redeem) {
  return tx(() => {
    const appt = get('SELECT * FROM appointments WHERE id = ?', id);
    if (!appt) fail('NOT_FOUND', 404);
    if (appt.status !== 'completed' && redeem && appt.entitlement_id) {
      applySessionUse(appt.entitlement_id, 1, appt.appt_date, '', appt.id);
    }
    run(`UPDATE appointments SET status = 'completed' WHERE id = ?`, id);
    return getAppointment(id);
  });
}

function cancelAppointment(id) {
  return tx(() => {
    const appt = get('SELECT * FROM appointments WHERE id = ?', id);
    if (!appt) fail('NOT_FOUND', 404);
    const log = get('SELECT * FROM session_logs WHERE appointment_id = ?', id);
    if (log) {
      const ent = get('SELECT * FROM entitlements WHERE id = ?', log.entitlement_id);
      if (ent) {
        const used = ent.used_sessions - log.count;
        if (used < 0 || used > ent.total_sessions) fail('INVALID');
        run('UPDATE entitlements SET used_sessions = ? WHERE id = ?', used, ent.id);
      }
      run('DELETE FROM session_logs WHERE id = ?', log.id);
    }
    run(`UPDATE appointments SET status = 'cancelled' WHERE id = ?`, id);
    return getAppointment(id);
  });
}

function createBackup() {
  const dest = path.join(os.tmpdir(), `bianmore-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`);
  const sqlPath = dest.replace(/\\/g, '/').replace(/'/g, "''");
  db.exec(`VACUUM INTO '${sqlPath}'`);
  const buf = fs.readFileSync(dest);
  try { fs.unlinkSync(dest); } catch { /* ignore */ }
  return buf;
}

module.exports = {
  init,
  DB_FILE,
  SQL_FILE,
  getSettings,
  saveSettings,
  bootstrap,
  dashboard,
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  listProducts,
  saveProduct,
  deleteProduct,
  listPackages,
  getPackage,
  createPackage,
  updatePackage,
  deletePackage,
  listMembers,
  getMember,
  createMember,
  updateMember,
  deleteMember,
  getMemberProfile,
  listOrders,
  getOrder,
  createOrder,
  deleteOrder,
  exportOrderRows,
  useSessions,
  adjustSessions,
  undoLog,
  listAppointments,
  getAppointment,
  createAppointment,
  updateAppointment,
  deleteAppointment,
  completeAppointment,
  cancelAppointment,
  createBackup,
};
