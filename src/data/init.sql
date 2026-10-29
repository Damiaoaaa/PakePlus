-- 變MORE髮 會員系統初始化
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
