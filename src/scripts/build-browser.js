'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'lib', 'db.js'), 'utf8');
const lines = src.split(/\r?\n/);
const at = (prefix) => {
  const index = lines.findIndex((line) => line.startsWith(prefix));
  if (index < 0) throw new Error(`Missing ${prefix}`);
  return index;
};

const part = lines.slice(at('class DbError'), at('function removeDbFiles'))
  .concat(lines.slice(at('function getSettings'), at('function createBackup')))
  .join('\n');

const runtime = `
function wrap(raw) {
  return {
    exec(sql) {
      raw.exec(sql);
    },
    prepare(sql) {
      return {
        all(...params) {
          const stmt = raw.prepare(sql);
          try {
            if (params.length) stmt.bind(params);
            const rows = [];
            while (stmt.step()) rows.push(stmt.getAsObject());
            return rows;
          } finally {
            stmt.free();
          }
        },
        get(...params) {
          const rows = this.all(...params);
          return rows[0];
        },
        run(...params) {
          const stmt = raw.prepare(sql);
          try {
            if (params.length) stmt.bind(params);
            stmt.step();
          } finally {
            stmt.free();
          }
          const changes = raw.getRowsModified();
          const idStmt = raw.prepare('SELECT last_insert_rowid() AS id');
          try {
            idStmt.step();
            return { lastInsertRowid: Number(idStmt.getAsObject().id), changes };
          } finally {
            idStmt.free();
          }
        },
      };
    },
    export() {
      return raw.export();
    },
    close() {
      raw.close();
    },
  };
}

let SQLAPI = null;
let backend = 'idb';
let persistChain = Promise.resolve();
let hideHooked = false;

function asBytes(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return null;
}

function bytesToB64(bytes) {
  const chunk = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.subarray(i, Math.min(i + chunk, bytes.length));
    let partText = '';
    for (let j = 0; j < slice.length; j += 1) partText += String.fromCharCode(slice[j]);
    binary += partText;
  }
  return btoa(binary);
}

function b64ToBytes(text) {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function idbOpen() {
  return new Promise((resolve, reject) => {
    let request;
    try {
      request = indexedDB.open('bianmore-hair', 1);
    } catch (error) {
      reject(error);
      return;
    }
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains('files')) database.createObjectStore('files');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IDB'));
  });
}

function idbGet(key) {
  return idbOpen().then((database) => new Promise((resolve, reject) => {
    const tx = database.transaction('files', 'readonly');
    const request = tx.objectStore('files').get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }));
}

function idbSet(key, value) {
  return idbOpen().then((database) => new Promise((resolve, reject) => {
    const tx = database.transaction('files', 'readwrite');
    tx.objectStore('files').put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('IDB'));
    tx.onabort = () => reject(tx.error || new Error('IDB'));
  }));
}

async function detectBackend() {
  try {
    await idbSet('__ping', 1);
    backend = 'idb';
    return;
  } catch { /* this browser will not keep IndexedDB for a local page */ }
  try {
    localStorage.setItem('bianmore:__ping', '1');
    backend = 'local';
  } catch {
    backend = 'memory';
  }
}

async function storageGet(key) {
  if (backend === 'memory') return undefined;
  if (backend === 'idb') return idbGet(key);
  const raw = localStorage.getItem(\`bianmore:\${key}\`);
  if (raw == null) return undefined;
  return key === 'salon.sqlite' ? b64ToBytes(raw) : raw;
}

async function storageSet(key, value) {
  if (backend === 'memory') return;
  if (backend === 'idb') return idbSet(key, value);
  const raw = key === 'salon.sqlite' ? bytesToB64(value) : String(value);
  localStorage.setItem(\`bianmore:\${key}\`, raw);
}

function attach(raw) {
  const wrapped = wrap(raw);
  wrapped.exec('PRAGMA foreign_keys = ON');
  db = wrapped;
}

function createBackup() {
  return db.export();
}

function persist() {
  if (!db || backend === 'memory') return Promise.resolve();
  let bytes;
  try {
    bytes = db.export();
  } catch (error) {
    return Promise.reject(error);
  }
  const job = persistChain.then(() => storageSet('salon.sqlite', bytes));
  persistChain = job.catch(() => {});
  return job;
}

async function init() {
  if (!SQLAPI) {
    if (typeof initSqlJs !== 'function') {
      const error = new Error('INIT_FAILED');
      error.code = 'INIT_FAILED';
      throw error;
    }
    SQLAPI = await initSqlJs();
  }
  await detectBackend();
  let sqlCreated = false;
  let sqlText = await storageGet('init.sql');
  if (typeof sqlText !== 'string' || !sqlText.includes('CREATE TABLE members')) {
    sqlText = INIT_SQL;
    sqlCreated = true;
    await storageSet('init.sql', sqlText);
  }
  const saved = asBytes(await storageGet('salon.sqlite'));
  let dbCreated = !(saved && saved.length);
  let initialized = false;
  const openFresh = () => {
    attach(new SQLAPI.Database());
    db.exec(sqlText);
    initialized = true;
    dbCreated = true;
  };
  try {
    if (!dbCreated) {
      attach(new SQLAPI.Database(saved));
      const exists = get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'members'");
      if (!exists) {
        db.exec(sqlText);
        initialized = true;
      }
    } else {
      openFresh();
    }
  } catch (error) {
    try {
      openFresh();
    } catch (inner) {
      inner.code = inner.code || 'INIT_FAILED';
      throw inner;
    }
  }
  if (initialized || sqlCreated) await persist();
  if (!hideHooked) {
    hideHooked = true;
    window.addEventListener('pagehide', () => { persist(); });
  }
  const meta = { initialized, sqlCreated, dbCreated, volatile: backend === 'memory' };
  globalThis.salonDb.meta = meta;
  return meta;
}

globalThis.salonDb = {
  init,
  persist,
  createBackup,
  meta: null,
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
};
`;

const out = `/* Generated from lib/db.js. Double-click index.html; data stays in this browser. */\n(function () {\n${part}\n${runtime}\n})();\n`;
fs.mkdirSync(path.join(root, 'public', 'js'), { recursive: true });
fs.writeFileSync(path.join(root, 'public', 'js', 'salon-db.js'), out);

const vendorDir = path.join(root, 'public', 'vendor');
fs.mkdirSync(vendorDir, { recursive: true });
fs.copyFileSync(
  path.join(root, 'node_modules', 'sql.js', 'dist', 'sql-wasm-inline.js'),
  path.join(vendorDir, 'sql-wasm-inline.js')
);

const css = fs.readFileSync(path.join(root, 'public', 'css', 'receipt.css'), 'utf8');
const logo = fs.readFileSync(path.join(root, 'public', 'assets', 'logo.png')).toString('base64');
const brand = `const RECEIPT_CSS = ${JSON.stringify(css)};\nconst BRAND_LOGO = ${JSON.stringify(`data:image/png;base64,${logo}`)};\n`;
fs.writeFileSync(path.join(root, 'public', 'js', 'brand.js'), brand);
console.log('browser files ready');
