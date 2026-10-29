const state = {
  token: 0,
  route: { parts: [], query: {} },
  settings: {},
  draft: null,
  draftTab: 'packages',
  keySeq: 1,
  saving: false,
  confirmResolve: null,
  memberCallback: null,
  directory: [],
  members: [],
  packages: [],
  products: [],
  categories: [],
  profile: null,
  appointments: [],
  apptEntitlements: [],
  cal: null,
  calDay: '',
  calAnchor: '',
  receiptKind: 'invoice',
  receiptModel: null,
  productQuery: '',
};

let ordersToken = 0;
let membersToken = 0;
let searchToken = 0;
const CURRENCIES = ['HKD', 'USD', 'TWD', 'CNY', 'MOP', 'CAD', 'SGD'];

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function ymd(date) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

function todayStr() {
  return ymd(new Date());
}

function fmtDate(value) {
  if (!value) return '';
  const [year, month, day] = String(value).slice(0, 10).split('-');
  return day ? `${day}/${month}/${year}` : String(value);
}

function money(value, currency) {
  const code = currency || state.settings.currency || 'HKD';
  const amount = Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${code} ${amount}`;
}

function L(row, field) {
  if (!row) return '';
  const zh = row[`${field}_zh`];
  const en = row[`${field}_en`];
  return getLang() === 'en' ? (en || zh || '') : (zh || en || '');
}

function brief(value) {
  return String(value || '').replace(/\s*\n\s*/g, ' ').trim();
}

function genderLabel(value) {
  if (value === 'male') return t('genderMale');
  if (value === 'female') return t('genderFemale');
  if (value === 'other') return t('genderOther');
  return t('genderUnset');
}

function errText(error) {
  const key = `err_${error?.code || 'ERROR'}`;
  const text = t(key);
  return text === key ? t('err_ERROR') : text;
}

function queryString(query) {
  const params = new URLSearchParams();
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  return params.toString();
}

function parseRoute() {
  const raw = (location.hash || '#/dashboard').replace(/^#/, '');
  const [path, qs] = raw.split('?');
  const parts = path.split('/').filter(Boolean);
  return { parts, query: Object.fromEntries(new URLSearchParams(qs || '')) };
}

function activeNav() {
  const head = state.route.parts[0] || 'dashboard';
  if (head === 'receipt') return 'orders';
  if (head === 'card') return 'members';
  return head;
}

function icon(name) {
  const paths = {
    home: '<path d="M4 11 12 4l8 7"/><path d="M6 10.5V20h12v-9.5"/>',
    users: '<path d="M16 19v-1.2A3.2 3.2 0 0 0 12.8 14.6H7.2A3.2 3.2 0 0 0 4 17.8V19"/><circle cx="10" cy="8" r="3"/><path d="M20 19v-1.1A2.8 2.8 0 0 0 17.4 15"/><path d="M15 5.2a2.6 2.6 0 0 1 0 5"/>',
    orders: '<path d="M7 3.5h7l4 4V20.5H7z"/><path d="M14 3.5V8h4"/><path d="M9.5 12h6M9.5 16h6"/>',
    packages: '<path d="M3.5 8 12 4l8.5 4L12 12z"/><path d="M3.5 8v8L12 20l8.5-4V8"/><path d="M12 12v8"/>',
    products: '<path d="M4 7h16v12H4z"/><path d="M4 11h16"/><path d="M8 7V5h8v2"/>',
    calendar: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3.5V7M16 3.5V7M4 10h16"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 3.5v2.2M12 18.3V20.5M3.5 12h2.2M18.3 12H20.5M5.8 5.8l1.6 1.6M16.6 16.6l1.6 1.6M18.2 5.8l-1.6 1.6M7.4 16.6l-1.6 1.6"/>',
  };
  return `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${paths[name] || ''}</svg>`;
}

function navLink(name, iconName, label) {
  const on = activeNav() === name ? 'active' : '';
  return `<a class="${on}" href="#/${name}" data-nav="${name}">${icon(iconName)}<span>${esc(label)}</span></a>`;
}

function pageHead(title, lede, actions = '') {
  return `<div class="page-head"><div><h1>${esc(title)}</h1>${lede ? `<p class="lede">${esc(lede)}</p>` : ''}</div><div class="page-actions">${actions}</div></div>`;
}

function field(label, inner, full = false) {
  return `<label class="field${full ? ' full' : ''}"><span>${esc(label)}</span>${inner}</label>`;
}

function statusPill(status) {
  const cls = status === 'completed' ? 'pill-ok' : status === 'cancelled' ? 'pill-off' : '';
  return `<span class="pill ${cls}">${esc(t(status))}</span>`;
}

function toast(message, action) {
  const el = document.getElementById('toast');
  el.hidden = false;
  el.innerHTML = `<span>${esc(message)}</span>${action ? `<button type="button" data-act="${esc(action.act)}" data-id="${esc(action.id || '')}">${esc(action.label)}</button>` : ''}`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => {
    el.hidden = true;
    el.innerHTML = '';
  }, action ? 6000 : 2600);
}

function showError(error) {
  console.error(error);
  toast(errText(error));
}

function openModal(inner) {
  const root = document.getElementById('modal');
  root.hidden = false;
  root.innerHTML = `<div class="modal-back" data-act="modal-close"></div><div class="modal-card" role="dialog">${inner}</div>`;
}

function closeModal() {
  const root = document.getElementById('modal');
  root.hidden = true;
  root.innerHTML = '';
  state.memberCallback = null;
  if (state.confirmResolve) {
    const resolve = state.confirmResolve;
    state.confirmResolve = null;
    resolve(false);
  }
}

function confirmYes() {
  const resolve = state.confirmResolve;
  state.confirmResolve = null;
  closeModal();
  if (resolve) resolve(true);
}

function confirmBox(message, okLabel) {
  return new Promise((resolve) => {
    state.confirmResolve = resolve;
    openModal(`<h2>${esc(t('confirm'))}</h2><p>${esc(message)}</p>
      <div class="modal-actions">
        <button type="button" class="btn" data-act="confirm-no">${esc(t('cancel'))}</button>
        <button type="button" class="btn btn-danger" data-act="confirm-yes">${esc(okLabel || t('confirm'))}</button>
      </div>`);
  });
}

function renderShell() {
  document.documentElement.lang = getLang() === 'zh' ? 'zh-Hant' : 'en';
  document.getElementById('app').innerHTML = `
    <div class="shell">
      <aside class="side">
        <div class="brand">
          <img src="public/assets/logo.png" alt="變MORE髮">
          <p>${esc(t('appSubtitle'))}</p>
        </div>
        <nav class="nav">
          ${navLink('dashboard', 'home', t('dashboard'))}
          ${navLink('members', 'users', t('members'))}
          ${navLink('orders', 'orders', t('orders'))}
          ${navLink('packages', 'packages', t('packages'))}
          ${navLink('products', 'products', t('products'))}
          ${navLink('calendar', 'calendar', t('calendar'))}
          ${navLink('settings', 'settings', t('settings'))}
        </nav>
        <div class="side-foot">${esc(t('offline'))}</div>
      </aside>
      <div class="main">
        <header class="top">
          <div class="top-search">
            <input id="global-search" type="search" placeholder="${esc(t('memberSearch'))}" autocomplete="off">
            <div id="search-pop" class="combo-pop" hidden></div>
          </div>
          <div class="lang">
            <button type="button" data-act="lang" data-lang="zh" class="${getLang() === 'zh' ? 'on' : ''}">繁</button>
            <button type="button" data-act="lang" data-lang="en" class="${getLang() === 'en' ? 'on' : ''}">EN</button>
          </div>
        </header>
        <div id="view"></div>
      </div>
    </div>`;
  bindShell();
}

function highlightNav() {
  const name = activeNav();
  document.querySelectorAll('.nav a').forEach((link) => link.classList.toggle('active', link.dataset.nav === name));
}

function bindShell() {
  const input = document.getElementById('global-search');
  if (!input) return;
  let timer;
  input.oninput = () => {
    clearTimeout(timer);
    const q = input.value.trim();
    const pop = document.getElementById('search-pop');
    if (!q) {
      if (pop) pop.hidden = true;
      return;
    }
    timer = setTimeout(async () => {
      const token = ++searchToken;
      try {
        const rows = await api.get(`/api/members?q=${encodeURIComponent(q)}`);
        if (token !== searchToken) return;
        paintSearch(rows);
      } catch (error) {
        showError(error);
      }
    }, 160);
  };
  input.onkeydown = (event) => {
    if (event.key !== 'Enter') return;
    const first = document.querySelector('#search-pop a');
    if (first) {
      event.preventDefault();
      first.click();
    }
  };
}

function paintSearch(rows) {
  const pop = document.getElementById('search-pop');
  if (!pop) return;
  pop.hidden = false;
  if (!rows.length) {
    pop.innerHTML = `<div class="combo-empty">${esc(t('noMember'))}</div>`;
    return;
  }
  pop.innerHTML = rows.slice(0, 8).map((member) => `
    <a class="combo-opt" href="#/members/${member.id}">
      <b>${esc(member.name)}</b>
      <span>${esc(member.member_no)}${member.phone ? ` · ${esc(member.phone)}` : ''} · ${esc(t('leftTimes', { n: member.remaining }))}</span>
    </a>`).join('');
}

function setLanguage(lang) {
  setLang(lang);
  try { localStorage.setItem('bianmore-lang', lang); } catch { /* file page may block storage */ }
  renderShell();
  highlightNav();
  render();
  api.put('/api/settings', { lang }).then((settings) => {
    state.settings = settings;
  }).catch(() => {});
}

function titleKey(route) {
  const head = route.parts[0] || 'dashboard';
  if (head === 'receipt') return 'receipt';
  if (head === 'card') return 'card';
  return head;
}

async function render() {
  const token = ++state.token;
  const route = parseRoute();
  state.route = route;
  highlightNav();
  document.title = `${t(titleKey(route))} · 變MORE髮`;
  const timer = setTimeout(() => {
    if (token !== state.token) return;
    const view = document.getElementById('view');
    if (view) view.innerHTML = `<div class="loading">${esc(t('loading'))}</div>`;
  }, 180);
  try {
    const html = await viewHtml(route, token);
    clearTimeout(timer);
    if (html == null || token !== state.token) return;
    document.getElementById('view').innerHTML = html;
    afterRender(route);
  } catch (error) {
    clearTimeout(timer);
    if (token !== state.token) return;
    const view = document.getElementById('view');
    if (view) view.innerHTML = `<div class="card empty">${esc(errText(error))}</div>`;
  }
}

async function viewHtml(route, token) {
  const head = route.parts[0] || 'dashboard';
  if (head === 'dashboard') return dashboardHtml(token);
  if (head === 'members' && route.parts[1]) return memberHtml(token, route.parts[1]);
  if (head === 'members') return membersHtml(token);
  if (head === 'orders' && route.parts[1] === 'new') return orderNewHtml(token);
  if (head === 'orders') return ordersHtml(token);
  if (head === 'receipt' && route.parts[1]) return receiptHtml(token, route.parts[1]);
  if (head === 'card' && route.parts[1]) return cardHtml(token, route.parts[1]);
  if (head === 'packages') return packagesHtml(token);
  if (head === 'products') return productsHtml(token);
  if (head === 'calendar') return calendarHtml(token);
  if (head === 'settings') return settingsHtml();
  return `<div class="card empty">${esc(t('empty'))}</div>`;
}

function afterRender(route) {
  const head = route.parts[0];
  if (head === 'orders' && route.parts[1] === 'new') bindOrderNew();
  if (head === 'orders' && route.parts[1] !== 'new') bindOrderFilters();
  if (head === 'members' && !route.parts[1]) bindMemberFilters();
  if (head === 'products') bindProductSearch();
}

async function dashboardHtml(token) {
  const data = await api.get('/api/dashboard');
  if (token !== state.token) return null;
  const appts = data.today_appointments.map((appt) => `
    <div class="appt">
      <strong>${esc(appt.appt_time)} · ${esc(appt.member_name)}</strong>
      <div class="small muted">${esc(L(appt, 'title'))}</div>
      <div class="row-actions" style="margin-top:8px">
        ${appt.status !== 'completed' ? `<button type="button" class="btn btn-gold" data-act="appt-complete" data-id="${appt.id}" data-redeem="${appt.entitlement_id ? 1 : 0}">${esc(appt.entitlement_id ? t('completeRedeem') : t('completeOnly'))}</button>` : statusPill(appt.status)}
        <a class="btn" href="#/members/${appt.member_id}">${esc(t('detail'))}</a>
      </div>
    </div>`).join('');
  const low = data.low.map((ent) => `
    <div class="appt">
      <a class="link" href="#/members/${ent.member_id}">${esc(ent.member_name)}</a>
      <div>${esc(L(ent, 'name'))}</div>
      <strong>${esc(t('leftTimes', { n: ent.remaining }))}</strong>
    </div>`).join('');
  const recent = data.recent_orders.map((order) => `
    <div class="appt">
      <a class="link" href="#/receipt/${order.id}">${esc(order.order_no)}</a>
      <div class="small">${esc(fmtDate(order.order_date))} · ${esc(order.member_name)}</div>
      <div class="small muted">${esc(brief(L(order, 'summary')))}</div>
      <div class="num">${esc(money(order.total, order.currency))}</div>
    </div>`).join('');
  const welcome = data.members === 0 ? `<div class="card"><h2>${esc(t('welcome'))}</h2><p class="lede">${esc(t('welcomeBody'))}</p></div>` : '';
  return `${pageHead(t('dashTitle'), t('dashLede'), `<a class="btn btn-gold" href="#/orders/new">${esc(t('newOrder'))}</a><button type="button" class="btn" data-act="open-member">${esc(t('newMember'))}</button>`)}
    <section class="stats">
      <article class="stat"><span>${esc(t('statMembers'))}</span><strong>${esc(data.members)}</strong></article>
      <article class="stat"><span>${esc(t('statAppts'))}</span><strong>${esc(data.appointments_today)}</strong></article>
      <article class="stat"><span>${esc(t('statRemain'))}</span><strong>${esc(data.remaining_sessions)}</strong></article>
      <article class="stat"><span>${esc(t('statMonth'))}</span><strong>${esc(money(data.month_total, data.currency))}</strong></article>
    </section>
    ${welcome}
    <section class="split">
      <article class="card"><h2>${esc(t('upcomingTitle'))}</h2>${appts || `<p class="empty">${esc(t('noAppt'))}</p>`}</article>
      <article class="card"><h2>${esc(t('lowTitle'))}</h2>${low || `<p class="empty">${esc(t('noLow'))}</p>`}</article>
    </section>
    <article class="card"><h2>${esc(t('recentOrders'))}</h2>${recent || `<p class="empty">${esc(t('noOrders'))}</p>`}</article>`;
}

function memberRows(rows) {
  if (!rows.length) return `<tr><td class="empty" colspan="6">${esc(t('empty'))}</td></tr>`;
  return rows.map((member) => `
    <tr>
      <td>${esc(member.member_no)}</td>
      <td><a href="#/members/${member.id}">${esc(member.name)}</a></td>
      <td>${esc(member.phone || '—')}</td>
      <td><div class="remain-no">${esc(member.remaining)}</div><div class="small muted">${esc(brief(L(member, 'summary')))}</div></td>
      <td class="num">${esc(member.order_count)}</td>
      <td class="row-actions">
        <a class="btn" href="#/members/${member.id}">${esc(t('detail'))}</a>
        <a class="btn btn-gold" href="#/orders/new?member=${member.id}">${esc(t('openOrder'))}</a>
      </td>
    </tr>`).join('');
}

async function membersHtml(token) {
  const data = await api.get(`/api/members?${queryString(state.route.query)}`);
  if (token !== state.token) return null;
  state.members = data;
  const remainOn = state.route.query.remain === '1';
  const q = state.route.query.q || '';
  const remainHref = `#/members?${queryString({ remain: '1', q })}`;
  const allHref = `#/members${q ? `?q=${encodeURIComponent(q)}` : ''}`;
  return `${pageHead(t('memberTitle'), '', `<button type="button" class="btn btn-gold" data-act="open-member">${esc(t('newMember'))}</button>`)}
    <div class="card">
      <div class="filters">
        <label class="grow"><span>${esc(t('memberSearch'))}</span><input id="member-q" value="${esc(q)}" autocomplete="off"></label>
        <a class="btn ${remainOn ? 'btn-dark' : ''}" href="${remainHref}">${esc(t('hasRemain'))}</a>
        <a class="btn ${remainOn ? '' : 'btn-dark'}" href="${allHref}">${esc(t('showAll'))}</a>
      </div>
      <div class="table-wrap" style="margin-top:12px">
        <table class="data">
          <thead><tr><th>${esc(t('memberNo'))}</th><th>${esc(t('name'))}</th><th>${esc(t('phone'))}</th><th>${esc(t('remainCol'))}</th><th>${esc(t('ordersCount'))}</th><th></th></tr></thead>
          <tbody id="member-tbody">${memberRows(data)}</tbody>
        </table>
      </div>
    </div>`;
}

function bindMemberFilters() {
  const input = document.getElementById('member-q');
  if (!input) return;
  let timer;
  input.oninput = () => {
    clearTimeout(timer);
    timer = setTimeout(() => patchMemberQuery({ q: input.value.trim() }), 180);
  };
}

function patchMemberQuery(partial) {
  const params = new URLSearchParams(queryString(state.route.query));
  Object.entries(partial).forEach(([key, value]) => {
    if (value) params.set(key, value);
    else params.delete(key);
  });
  state.route.query = Object.fromEntries(params.entries());
  history.replaceState(null, '', `#/members${params.toString() ? `?${params}` : ''}`);
  reloadMembers();
}

async function reloadMembers() {
  const token = ++membersToken;
  try {
    const data = await api.get(`/api/members?${queryString(state.route.query)}`);
    if (token !== membersToken) return;
    state.members = data;
    const body = document.getElementById('member-tbody');
    if (body) body.innerHTML = memberRows(data);
  } catch (error) {
    showError(error);
  }
}

async function memberHtml(token, id) {
  const profile = await api.get(`/api/members/${id}/profile`);
  if (token !== state.token) return null;
  state.profile = profile;
  const member = profile.member;
  const remaining = profile.entitlements.reduce((sum, ent) => sum + Number(ent.remaining), 0);
  const used = profile.entitlements.reduce((sum, ent) => sum + Number(ent.used_sessions), 0);
  const cards = profile.entitlements.map((ent) => {
    const pct = ent.total_sessions ? Math.max(0, Math.min(100, (ent.remaining / ent.total_sessions) * 100)) : 0;
    return `<article class="ent-card ${ent.remaining ? '' : 'ent-done'}">
      <div class="row-actions" style="justify-content:space-between">
        <h3>${esc(L(ent, 'name'))}</h3>
        ${ent.remaining ? '' : `<span class="pill pill-off">${esc(t('usedUp'))}</span>`}
      </div>
      <a class="small link" href="#/receipt/${ent.order_id}">${esc(ent.order_no)} · ${esc(fmtDate(ent.order_date))}</a>
      <div class="ent-num"><strong>${esc(ent.remaining)}</strong><div class="small muted">/ ${esc(ent.total_sessions)}</div></div>
      <div class="small muted">${esc(t('usedTimes', { n: ent.used_sessions }))} · ${esc(t('totalTimes', { n: ent.total_sessions }))}</div>
      <div class="meter"><i style="width:${pct}%"></i></div>
      <div class="row-actions">
        ${ent.remaining ? `<button type="button" class="btn btn-gold" data-act="use-session" data-id="${ent.id}">${esc(t('useOnce'))}</button>` : ''}
        <button type="button" class="btn" data-act="open-adjust" data-id="${ent.id}" data-total="${ent.total_sessions}" data-used="${ent.used_sessions}">${esc(t('adjust'))}</button>
      </div>
    </article>`;
  }).join('');
  const orders = profile.orders.length ? profile.orders.map((order) => `
    <tr>
      <td><a href="#/receipt/${order.id}">${esc(order.order_no)}</a></td>
      <td>${esc(fmtDate(order.order_date))}</td>
      <td>${esc(brief(L(order, 'summary')))}</td>
      <td class="num">${esc(money(order.total, order.currency))}</td>
    </tr>`).join('') : `<tr><td class="empty" colspan="4">${esc(t('noPurchase'))}</td></tr>`;
  const appts = profile.appointments.length ? profile.appointments.map((appt) => `
    <div class="appt">
      <strong>${esc(fmtDate(appt.appt_date))} ${esc(appt.appt_time)}</strong> ${statusPill(appt.status)}
      <div>${esc(L(appt, 'title'))}</div>
      ${appt.notes ? `<div class="small muted">${esc(appt.notes)}</div>` : ''}
    </div>`).join('') : `<p class="empty">${esc(t('apptEmpty'))}</p>`;
  const logs = profile.logs.length ? profile.logs.map((log) => `
    <tr>
      <td>${esc(fmtDate(log.used_on))}</td>
      <td>${esc(L(log, 'name'))}</td>
      <td class="num">${esc(log.count)}</td>
      <td>${esc(log.notes || '')}</td>
      <td><button type="button" class="btn" data-act="revoke-log" data-id="${log.id}">${esc(t('undo'))}</button></td>
    </tr>`).join('') : `<tr><td class="empty" colspan="5">${esc(t('logsEmpty'))}</td></tr>`;
  return `${pageHead(member.name, `${member.member_no} · ${t('joined')} ${fmtDate(member.created_at)}`, `
      <a class="btn btn-gold" href="#/orders/new?member=${member.id}">${esc(t('openOrder'))}</a>
      <a class="btn" href="#/orders?member=${member.id}">${esc(t('showOrders'))}</a>
      <a class="btn" href="#/card/${member.id}">${esc(t('printCard'))}</a>
      <button type="button" class="btn" data-act="export-member" data-id="${member.id}">${esc(t('exportMember'))}</button>
      <button type="button" class="btn" data-act="open-member" data-id="${member.id}">${esc(t('edit'))}</button>
      <button type="button" class="btn" data-act="open-appt" data-member="${member.id}" data-day="${todayStr()}">${esc(t('newAppt'))}</button>
      <button type="button" class="btn btn-danger" data-act="delete-member" data-id="${member.id}">${esc(t('delete'))}</button>`)}
    <article class="card profile-top">
      <div>
        <h2>${esc(t('contact'))}</h2>
        <p>${esc(t('phone'))}：${esc(member.phone || '—')}</p>
        <p>${esc(t('email'))}：${esc(member.email || '—')}</p>
        <p>${esc(t('gender'))}：${esc(genderLabel(member.gender))}${member.birthday ? ` · ${esc(t('birthday'))} ${esc(fmtDate(member.birthday))}` : ''}</p>
        <p class="addr" style="white-space:pre-line">${esc(member.address || t('noAddress'))}</p>
        ${member.notes ? `<p class="muted">${esc(member.notes)}</p>` : ''}
      </div>
      <div class="profile-stats">
        <div><span class="small muted">${esc(t('remainCol'))}</span><strong>${esc(remaining)}</strong></div>
        <div><span class="small muted">${esc(getLang() === 'en' ? 'Used' : '已用')}</span><strong>${esc(used)}</strong></div>
        <div><span class="small muted">${esc(t('ordersCount'))}</span><strong>${esc(profile.orders.length)}</strong></div>
      </div>
    </article>
    <h2 style="margin:18px 0 10px">${esc(t('entitlements'))}</h2>
    ${cards ? `<div class="ent-grid">${cards}</div>` : `<div class="card empty">${esc(t('noEntitlement'))}</div>`}
    <article class="card">
      <h2>${esc(t('purchaseHistory'))}</h2>
      <div class="table-wrap"><table class="data"><thead><tr><th>${esc(t('orderNo'))}</th><th>${esc(t('date'))}</th><th>${esc(t('items'))}</th><th>${esc(t('amount'))}</th></tr></thead><tbody>${orders}</tbody></table></div>
    </article>
    <section class="split">
      <article class="card"><h2>${esc(t('appointments'))}</h2>${appts}</article>
      <article class="card"><h2>${esc(t('sessionLogs'))}</h2>
        <div class="table-wrap"><table class="data"><thead><tr><th>${esc(t('date'))}</th><th>${esc(t('items'))}</th><th>${esc(t('sessionsField'))}</th><th>${esc(t('notes'))}</th><th></th></tr></thead><tbody>${logs}</tbody></table></div>
      </article>
    </section>`;
}

function orderRows(rows) {
  if (!rows.length) return `<tr><td class="empty" colspan="6">${esc(t('noMatch'))}</td></tr>`;
  return rows.map((order) => `
    <tr>
      <td><a href="#/receipt/${order.id}">${esc(order.order_no)}</a></td>
      <td>${esc(fmtDate(order.order_date))}</td>
      <td><a href="#/members/${order.member_id}">${esc(order.member_name)}</a><div class="small muted">${esc(order.member_no)}</div></td>
      <td>${esc(brief(L(order, 'summary')))}</td>
      <td class="num">${esc(money(order.total, order.currency))}</td>
      <td class="row-actions">
        <a class="btn" href="#/receipt/${order.id}">${esc(t('print'))}</a>
        <a class="btn" href="#/members/${order.member_id}">${esc(t('detail'))}</a>
      </td>
    </tr>`).join('');
}

function orderBanner(member) {
  if (!member) return '';
  return `<div class="banner"><strong>${esc(t('filterBanner', { name: member.name }))}</strong>
    <span class="row-actions"><a class="btn" href="#/members/${member.id}">${esc(t('viewMember'))}</a>
    <button type="button" class="btn btn-ghost" data-act="clear-order-filter">${esc(t('clearFilter'))}</button></span></div>`;
}

async function ordersHtml(token) {
  const [data, directory] = await Promise.all([
    api.get(`/api/orders?${queryString(state.route.query)}`),
    api.get('/api/members'),
  ]);
  if (token !== state.token) return null;
  state.directory = directory;
  const q = state.route.query;
  const options = [`<option value="">${esc(t('allMembers'))}</option>`].concat(directory.map((member) =>
    `<option value="${member.id}" ${String(q.member) === String(member.id) ? 'selected' : ''}>${esc(member.member_no)} ${esc(member.name)}</option>`)).join('');
  return `${pageHead(t('orderTitle'), t('orderLede'), `<a class="btn btn-gold" href="#/orders/new">${esc(t('newOrder'))}</a><button type="button" class="btn" data-act="export-orders">${esc(t('exportFiltered'))}</button>`)}
    <div id="order-banner">${orderBanner(data.member)}</div>
    <div class="card">
      <div class="filters">
        <label class="grow"><span>${esc(t('members'))}</span><select id="f-member">${options}</select></label>
        <label><span>${esc(t('from'))}</span><input id="f-from" type="date" value="${esc(q.from || '')}"></label>
        <label><span>${esc(t('to'))}</span><input id="f-to" type="date" value="${esc(q.to || '')}"></label>
        <label class="grow"><span>${esc(t('keyword'))}</span><input id="f-q" value="${esc(q.q || '')}" autocomplete="off"></label>
      </div>
      <div class="table-wrap" style="margin-top:12px">
        <table class="data">
          <thead><tr><th>${esc(t('orderNo'))}</th><th>${esc(t('date'))}</th><th>${esc(t('members'))}</th><th>${esc(t('items'))}</th><th>${esc(t('amount'))}</th><th></th></tr></thead>
          <tbody id="order-tbody">${orderRows(data.orders)}</tbody>
        </table>
      </div>
    </div>`;
}

function bindOrderFilters() {
  const member = document.getElementById('f-member');
  const from = document.getElementById('f-from');
  const to = document.getElementById('f-to');
  const q = document.getElementById('f-q');
  if (member) member.onchange = () => patchOrderQuery({ member: member.value });
  if (from) from.onchange = () => patchOrderQuery({ from: from.value });
  if (to) to.onchange = () => patchOrderQuery({ to: to.value });
  if (q) {
    let timer;
    q.oninput = () => {
      clearTimeout(timer);
      timer = setTimeout(() => patchOrderQuery({ q: q.value.trim() }), 200);
    };
  }
}

function patchOrderQuery(partial) {
  const params = new URLSearchParams(queryString(state.route.query));
  Object.entries(partial).forEach(([key, value]) => {
    if (value) params.set(key, value);
    else params.delete(key);
  });
  state.route.query = Object.fromEntries(params.entries());
  history.replaceState(null, '', `#/orders${params.toString() ? `?${params}` : ''}`);
  reloadOrders();
}

async function reloadOrders() {
  const token = ++ordersToken;
  try {
    const data = await api.get(`/api/orders?${queryString(state.route.query)}`);
    if (token !== ordersToken) return;
    const body = document.getElementById('order-tbody');
    const banner = document.getElementById('order-banner');
    if (body) body.innerHTML = orderRows(data.orders);
    if (banner) banner.innerHTML = orderBanner(data.member);
  } catch (error) {
    showError(error);
  }
}

function clearOrderFilter() {
  state.route.query = {};
  history.replaceState(null, '', '#/orders');
  ['f-member', 'f-from', 'f-to', 'f-q'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  reloadOrders();
}

function blankDraft(memberId) {
  return {
    member_id: memberId ? String(memberId) : '',
    order_date: todayStr(),
    notes: '',
    template: 'invoice',
    currency: state.settings.currency || 'HKD',
    items: [],
  };
}

function ensureDraft(query) {
  const member = query.member || '';
  if (!state.draft) {
    state.draft = blankDraft(member);
    return;
  }
  if (member && String(state.draft.member_id) !== String(member)) state.draft = blankDraft(member);
}

function packageSessions(pkg) {
  if (pkg.items?.length) return pkg.items.reduce((sum, item) => sum + Number(item.sessions), 0);
  return Number(pkg.sessions) || 0;
}

function packageText(pkg) {
  if (pkg.items?.length) {
    return {
      zh: `${pkg.name_zh}\n${pkg.items.map((item) => `${item.name_zh} ×${item.sessions}`).join('、')}`,
      en: `${pkg.name_en}\n${pkg.items.map((item) => `${item.name_en} x${item.sessions}`).join(', ')}`,
    };
  }
  return {
    zh: `${pkg.name_zh}\n（含 ${pkg.sessions} 次）`,
    en: `${pkg.name_en}\n(includes ${pkg.sessions} sessions)`,
  };
}

function productText(product) {
  if (Number(product.sessions) > 0) {
    return {
      zh: `${product.name_zh}\n（含 ${product.sessions} 次）`,
      en: `${product.name_en}\n(includes ${product.sessions} sessions)`,
    };
  }
  return { zh: product.name_zh, en: product.name_en };
}

function draftTotal() {
  return state.draft.items.reduce((sum, item) => sum + (Number(item.unit_price) || 0) * (Number(item.quantity) || 0), 0);
}

function memberLabel(member) {
  return `${member.member_no}  ${member.name}${member.phone ? ` · ${member.phone}` : ''}`;
}

function catalogBody() {
  if (state.draftTab === 'products') {
    const rows = state.products.filter((product) => product.active);
    if (!rows.length) return `<p class="empty">${esc(t('empty'))}</p>`;
    return `<div class="tile-grid">${rows.map((product) => `
      <button type="button" class="tile" data-act="add-product" data-id="${product.id}">
        <b>${esc(L(product, 'name'))}</b>
        <span class="small muted">${esc(L(product, 'category_name') || t('uncategorized'))} · ${esc(product.sessions > 0 ? t('serviceTag') : t('retailTag'))}</span>
        <span class="price">${esc(money(product.price))}</span>
      </button>`).join('')}</div>`;
  }
  if (state.draftTab === 'custom') {
    return `<form class="card form-grid" data-act="add-custom">
      ${field(t('descZh'), '<textarea name="description_zh" rows="2"></textarea>', true)}
      ${field(t('descEn'), '<textarea name="description_en" rows="2"></textarea>', true)}
      ${field(t('qty'), '<input name="quantity" type="number" min="1" value="1">')}
      ${field(t('unitPrice'), '<input name="unit_price" type="number" min="0" step="0.01" value="0">')}
      ${field(t('sessionsField'), '<input name="sessions" type="number" min="0" value="0">', true)}
      <div class="full"><button class="btn btn-gold" type="submit">${esc(t('customItem'))}</button></div>
    </form>`;
  }
  const rows = state.packages.filter((pkg) => pkg.active);
  if (!rows.length) return `<p class="empty">${esc(t('empty'))}</p>`;
  return `<div class="tile-grid">${rows.map((pkg) => `
    <button type="button" class="tile" data-act="add-package" data-id="${pkg.id}">
      <b>${esc(L(pkg, 'name'))}</b>
      <span class="small muted">${esc(packageSessions(pkg))} ${esc(t('perVisit'))}</span>
      <span class="price">${esc(money(pkg.price))}</span>
    </button>`).join('')}</div>`;
}

function slipInner() {
  const draft = state.draft;
  const fieldName = getLang() === 'en' ? 'description_en' : 'description_zh';
  const lines = draft.items.map((item) => {
    const text = getLang() === 'en' ? item.description_en : item.description_zh;
    const sessions = Number(item.sessions) > 0 ? ` · ${t('writeSessions', { n: Number(item.sessions) * Number(item.quantity || 0) })}` : '';
    return `<div class="slip-line">
      <textarea data-field="${fieldName}" data-key="${item.key}">${esc(text)}</textarea>
      <div class="line-controls">
        <button type="button" class="btn" data-act="draft-dec" data-key="${item.key}">−</button>
        <input data-field="quantity" data-key="${item.key}" type="number" min="1" value="${esc(item.quantity)}">
        <button type="button" class="btn" data-act="draft-inc" data-key="${item.key}">+</button>
        <input data-field="unit_price" data-key="${item.key}" type="number" min="0" step="0.01" value="${esc(item.unit_price)}">
        <button type="button" class="btn btn-ghost" data-act="draft-del" data-key="${item.key}">${esc(t('remove'))}</button>
      </div>
      <p class="small muted" data-line="${item.key}">${esc(money((Number(item.unit_price) || 0) * (Number(item.quantity) || 0), draft.currency))}${esc(sessions)}</p>
    </div>`;
  }).join('');
  return `<h2>${esc(t('slip'))}</h2>
    ${lines || `<p class="empty">${esc(t('slipEmpty'))}</p>`}
    <label class="field" style="margin-top:12px"><span>${esc(t('notes'))}</span><textarea id="draft-notes">${esc(draft.notes || '')}</textarea></label>
    <div class="slip-total"><span>${esc(t('totalWord'))}</span><strong id="slip-total">${esc(money(draftTotal(), draft.currency))}</strong></div>
    <div class="page-actions" style="margin-top:14px">
      <button type="button" class="btn" data-act="clear-draft">${esc(t('clearDraft'))}</button>
      <button type="button" class="btn btn-gold" data-act="save-order">${esc(t('generate'))}</button>
    </div>`;
}

async function orderNewHtml(token) {
  ensureDraft(state.route.query);
  const [directory, packages, products, categories] = await Promise.all([
    api.get('/api/members'),
    api.get('/api/packages'),
    api.get('/api/products'),
    api.get('/api/categories'),
  ]);
  if (token !== state.token) return null;
  state.directory = directory;
  state.packages = packages;
  state.products = products;
  state.categories = categories;
  const selected = state.directory.find((member) => String(member.id) === String(state.draft.member_id));
  const currencies = CURRENCIES.includes(state.draft.currency) ? CURRENCIES : [state.draft.currency, ...CURRENCIES];
  return `${pageHead(t('orderNew'), t('orderNewLede'), `<button type="button" class="btn" data-act="open-quick-member">${esc(t('quickCreate'))}</button>`)}
    <div class="card order-meta">
      <label class="grow"><span>${esc(t('members'))}</span>
        <div class="combo">
          <input id="member-combo-input" value="${esc(selected ? memberLabel(selected) : '')}" placeholder="${esc(t('memberSearch'))}" autocomplete="off">
          <div id="member-combo-pop" class="combo-pop" hidden></div>
        </div>
      </label>
      <label><span>${esc(t('date'))}</span><input id="draft-date" type="date" value="${esc(state.draft.order_date)}"></label>
      <label><span>${esc(t('currency'))}</span><select id="draft-currency">${currencies.map((code) => `<option ${code === state.draft.currency ? 'selected' : ''}>${code}</option>`).join('')}</select></label>
      <label><span>${esc(t('template'))}</span><select id="draft-template">
        <option value="invoice" ${state.draft.template === 'invoice' ? 'selected' : ''}>${esc(t('tplInvoice'))}</option>
        <option value="compact" ${state.draft.template === 'compact' ? 'selected' : ''}>${esc(t('tplCompact'))}</option>
      </select></label>
    </div>
    <p id="member-preview" class="small muted" style="margin:8px 0 12px">${esc(selected?.address || (selected ? t('noAddress') : ''))}</p>
    <div class="composer">
      <div>
        <div class="tabs">
          <button type="button" class="btn ${state.draftTab === 'packages' ? 'on' : ''}" data-act="tab" data-tab="packages">${esc(t('presetPackages'))}</button>
          <button type="button" class="btn ${state.draftTab === 'products' ? 'on' : ''}" data-act="tab" data-tab="products">${esc(t('catalog'))}</button>
          <button type="button" class="btn ${state.draftTab === 'custom' ? 'on' : ''}" data-act="tab" data-tab="custom">${esc(t('customItem'))}</button>
        </div>
        <div id="catalog-body">${catalogBody()}</div>
      </div>
      <aside id="slip" class="card slip">${slipInner()}</aside>
    </div>`;
}

function bindOrderNew() {
  const input = document.getElementById('member-combo-input');
  if (input) {
    input.oninput = () => showMemberCombo(input.value);
    input.onfocus = () => showMemberCombo(input.value);
    input.onblur = () => setTimeout(() => {
      const pop = document.getElementById('member-combo-pop');
      if (pop) pop.hidden = true;
    }, 180);
    input.onkeydown = (event) => {
      if (event.key !== 'Enter') return;
      const first = document.querySelector('#member-combo-pop [data-act="pick-member"]');
      if (first) {
        event.preventDefault();
        pickMember(first.dataset.id);
      }
    };
  }
  const view = document.getElementById('view');
  view.onchange = (event) => {
    if (!state.draft) return;
    if (event.target.id === 'draft-date') state.draft.order_date = event.target.value;
    if (event.target.id === 'draft-currency') {
      state.draft.currency = event.target.value;
      paintSlip();
    }
    if (event.target.id === 'draft-template') state.draft.template = event.target.value;
  };
  view.oninput = (event) => {
    if (!state.draft) return;
    if (event.target.id === 'draft-notes') {
      state.draft.notes = event.target.value;
      return;
    }
    const el = event.target.closest('[data-field]');
    if (!el) return;
    const item = state.draft.items.find((row) => row.key === el.dataset.key);
    if (!item) return;
    item[el.dataset.field] = el.value;
    if (el.dataset.field === 'quantity' || el.dataset.field === 'unit_price') {
      const line = document.querySelector(`[data-line="${item.key}"]`);
      const sessions = Number(item.sessions) > 0 ? ` · ${t('writeSessions', { n: Number(item.sessions) * Number(item.quantity || 0) })}` : '';
      if (line) line.textContent = `${money((Number(item.unit_price) || 0) * (Number(item.quantity) || 0), state.draft.currency)}${sessions}`;
      const total = document.getElementById('slip-total');
      if (total) total.textContent = money(draftTotal(), state.draft.currency);
    }
  };
}

function showMemberCombo(value) {
  const pop = document.getElementById('member-combo-pop');
  if (!pop) return;
  const q = value.trim().toLowerCase();
  const rows = state.directory.filter((member) => {
    const hay = `${member.name} ${member.phone} ${member.member_no}`.toLowerCase();
    return !q || hay.includes(q);
  }).slice(0, 8);
  pop.hidden = false;
  pop.innerHTML = rows.length ? rows.map((member) => `
    <button type="button" class="combo-opt" data-act="pick-member" data-id="${member.id}">
      <b>${esc(member.name)}</b><span>${esc(member.member_no)}${member.phone ? ` · ${esc(member.phone)}` : ''}</span>
    </button>`).join('') : `<div class="combo-empty">${esc(t('noMember'))}</div>`;
}

function pickMember(id) {
  const member = state.directory.find((row) => String(row.id) === String(id));
  if (!member || !state.draft) return;
  state.draft.member_id = String(member.id);
  const input = document.getElementById('member-combo-input');
  if (input) input.value = memberLabel(member);
  const preview = document.getElementById('member-preview');
  if (preview) preview.textContent = member.address || t('noAddress');
  const pop = document.getElementById('member-combo-pop');
  if (pop) pop.hidden = true;
}

function setTab(tab) {
  state.draftTab = tab;
  document.querySelectorAll('[data-act="tab"]').forEach((button) => button.classList.toggle('on', button.dataset.tab === tab));
  const body = document.getElementById('catalog-body');
  if (body) body.innerHTML = catalogBody();
}

function paintSlip() {
  const node = document.getElementById('slip');
  if (node) node.innerHTML = slipInner();
}

function addCatalog(type, id) {
  const row = (type === 'package' ? state.packages : state.products).find((item) => String(item.id) === String(id));
  if (!row || !state.draft) return;
  const existing = state.draft.items.find((item) => item.item_type === type && String(item.ref_id) === String(id));
  if (existing) {
    existing.quantity = Number(existing.quantity || 1) + 1;
    paintSlip();
    return;
  }
  const text = type === 'package' ? packageText(row) : productText(row);
  state.draft.items.push({
    key: `k${++state.keySeq}`,
    item_type: type,
    ref_id: row.id,
    description_zh: text.zh,
    description_en: text.en,
    quantity: 1,
    unit_price: row.price,
    sessions: type === 'package' ? packageSessions(row) : Number(row.sessions) || 0,
  });
  paintSlip();
}

function addCustom(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  if (!String(data.description_zh || '').trim() && !String(data.description_en || '').trim()) {
    toast(t('err_NAME_REQUIRED'));
    return;
  }
  state.draft.items.push({
    key: `k${++state.keySeq}`,
    item_type: 'custom',
    ref_id: null,
    description_zh: String(data.description_zh || '').trim(),
    description_en: String(data.description_en || '').trim(),
    quantity: Math.max(1, Number(data.quantity) || 1),
    unit_price: Number(data.unit_price) || 0,
    sessions: Math.max(0, Number(data.sessions) || 0),
  });
  form.reset();
  paintSlip();
}

function changeQty(key, delta) {
  const item = state.draft?.items.find((row) => row.key === key);
  if (!item) return;
  item.quantity = Math.max(1, Number(item.quantity || 1) + delta);
  paintSlip();
}

function removeDraftItem(key) {
  if (!state.draft) return;
  state.draft.items = state.draft.items.filter((item) => item.key !== key);
  paintSlip();
}

function clearDraft() {
  state.draft = blankDraft(state.route.query.member || '');
  render();
}

async function saveOrder() {
  if (!state.draft || state.saving) return;
  if (!state.draft.member_id) {
    toast(t('needMember'));
    return;
  }
  if (!state.draft.items.length) {
    toast(t('needItems'));
    return;
  }
  state.saving = true;
  try {
    const order = await api.post('/api/orders', {
      member_id: state.draft.member_id,
      order_date: state.draft.order_date || todayStr(),
      notes: state.draft.notes,
      template: state.draft.template,
      currency: state.draft.currency,
      items: state.draft.items.map((item) => ({
        item_type: item.item_type,
        ref_id: item.ref_id,
        description_zh: item.description_zh,
        description_en: item.description_en,
        quantity: Number(item.quantity) || 1,
        unit_price: Number(item.unit_price) || 0,
        sessions: Number(item.sessions) || 0,
      })),
    });
    state.draft = null;
    toast(t('orderSaved'));
    location.hash = `#/receipt/${order.id}`;
  } catch (error) {
    showError(error);
  } finally {
    state.saving = false;
  }
}

async function receiptHtml(token, id) {
  const order = await api.get(`/api/orders/${id}`);
  if (token !== state.token) return null;
  state.receiptKind = order.template === 'compact' ? 'compact' : 'invoice';
  state.receiptModel = { settings: state.settings, order };
  return `<div class="receipt-page">
    <div class="receipt-toolbar no-print">
      <div class="row-actions">
        <a class="btn" href="#/orders">${esc(t('back'))}</a>
        <button type="button" class="btn ${state.receiptKind === 'invoice' ? 'btn-gold' : ''}" data-act="switch-template" data-kind="invoice">${esc(t('tplInvoice'))}</button>
        <button type="button" class="btn ${state.receiptKind === 'compact' ? 'btn-gold' : ''}" data-act="switch-template" data-kind="compact">${esc(t('tplCompact'))}</button>
      </div>
      <div class="row-actions">
        <button type="button" class="btn btn-gold" data-act="print-sheet">${esc(t('print'))}</button>
        <button type="button" class="btn" data-act="download-sheet">${esc(t('downloadHtml'))}</button>
        <a class="btn" href="#/members/${order.member_id}">${esc(t('viewMember'))}</a>
        <button type="button" class="btn btn-danger" data-act="delete-order" data-id="${order.id}">${esc(t('delete'))}</button>
      </div>
    </div>
    <div id="sheet-mount">${sheetHtml(state.receiptKind, state.receiptModel)}</div>
  </div>`;
}

async function cardHtml(token, id) {
  const profile = await api.get(`/api/members/${id}/profile`);
  if (token !== state.token) return null;
  state.profile = profile;
  state.receiptKind = 'session';
  state.receiptModel = { settings: state.settings, profile };
  return `<div class="receipt-page">
    <div class="receipt-toolbar no-print">
      <a class="btn" href="#/members/${id}">${esc(t('back'))}</a>
      <div class="row-actions">
        <button type="button" class="btn btn-gold" data-act="print-sheet">${esc(t('print'))}</button>
        <button type="button" class="btn" data-act="download-sheet">${esc(t('downloadHtml'))}</button>
      </div>
    </div>
    <div id="sheet-mount">${sheetHtml('session', state.receiptModel)}</div>
  </div>`;
}

function switchTemplate(el) {
  state.receiptKind = el.dataset.kind;
  const mount = document.getElementById('sheet-mount');
  if (mount && state.receiptModel) mount.innerHTML = sheetHtml(state.receiptKind, state.receiptModel);
  document.querySelectorAll('[data-act="switch-template"]').forEach((button) => {
    button.classList.toggle('btn-gold', button.dataset.kind === state.receiptKind);
  });
}

async function downloadCurrent() {
  if (!state.receiptModel) return;
  try {
    await downloadSheet(state.receiptKind, state.receiptModel);
  } catch (error) {
    showError(error);
  }
}

async function packagesHtml(token) {
  const packages = await api.get('/api/packages');
  if (token !== state.token) return null;
  state.packages = packages;
  const cards = packages.map((pkg) => `
    <article class="pkg-card">
      <div class="row-actions" style="justify-content:space-between"><h3>${esc(L(pkg, 'name'))}</h3>${pkg.active ? `<span class="pill">${esc(t('active'))}</span>` : `<span class="pill pill-off">${esc(t('inactive'))}</span>`}</div>
      <div class="small muted">${esc(getLang() === 'en' ? pkg.name_zh : pkg.name_en)}</div>
      <div class="price">${esc(money(pkg.price))}</div>
      <div>${esc(packageSessions(pkg))} ${esc(t('perVisit'))}</div>
      ${pkg.items?.length ? `<div class="small">${pkg.items.map((item) => esc(`${L(item, 'name')} ×${item.sessions}`)).join('、')}</div>` : ''}
      <p class="small muted">${esc(L(pkg, 'description'))}</p>
      <div class="row-actions">
        <button type="button" class="btn" data-act="open-package" data-id="${pkg.id}">${esc(t('edit'))}</button>
        <button type="button" class="btn btn-danger" data-act="delete-package" data-id="${pkg.id}">${esc(t('delete'))}</button>
      </div>
    </article>`).join('');
  return `${pageHead(t('packageTitle'), t('packageHint'), `<button type="button" class="btn btn-gold" data-act="open-package">${esc(t('newPackage'))}</button>`)}
    <div class="pkg-grid">${cards || `<div class="card empty">${esc(t('empty'))}</div>`}</div>`;
}

async function productsHtml(token) {
  const [categories, products] = await Promise.all([api.get('/api/categories'), api.get('/api/products')]);
  if (token !== state.token) return null;
  state.categories = categories;
  state.products = products;
  const cat = state.route.query.cat || '';
  const links = [`<div class="cat-line"><a class="${cat ? '' : 'on'}" href="#/products">${esc(t('allCats'))}</a></div>`]
    .concat(categories.map((category) => `
      <div class="cat-line">
        <a class="${String(cat) === String(category.id) ? 'on' : ''}" href="#/products?cat=${category.id}">${esc(L(category, 'name'))}</a>
        <button type="button" class="btn btn-ghost" data-act="open-category" data-id="${category.id}">${esc(t('edit'))}</button>
        <button type="button" class="btn btn-ghost" data-act="delete-category" data-id="${category.id}">${esc(t('delete'))}</button>
      </div>`)).join('');
  return `${pageHead(t('productTitle'), t('goodsHint'), `<button type="button" class="btn" data-act="open-category">${esc(t('newCategory'))}</button><button type="button" class="btn btn-gold" data-act="open-product">${esc(t('newProduct'))}</button>`)}
    <div class="catalog-layout">
      <aside class="card"><h2>${esc(t('categories'))}</h2><div class="cat-list">${links}</div></aside>
      <section class="card">
        <label class="field"><span>${esc(t('productSearch'))}</span><input id="product-q" value="${esc(state.productQuery || '')}" autocomplete="off"></label>
        <div class="table-wrap" style="margin-top:12px">
          <table class="data">
            <thead><tr><th>${esc(t('name'))}</th><th>${esc(t('category'))}</th><th>${esc(t('price'))}</th><th>${esc(t('sessionsField'))}</th><th>${esc(t('activeLabel'))}</th><th></th></tr></thead>
            <tbody id="product-tbody">${productTableRows(products)}</tbody>
          </table>
        </div>
      </section>
    </div>`;
}

function productTableRows(products) {
  const cat = state.route.query.cat || '';
  const q = (state.productQuery || '').trim().toLowerCase();
  const rows = products.filter((product) => {
    if (cat && String(product.category_id || '') !== String(cat)) return false;
    if (!q) return true;
    return `${product.name_zh} ${product.name_en}`.toLowerCase().includes(q);
  });
  if (!rows.length) return `<tr><td class="empty" colspan="6">${esc(t('empty'))}</td></tr>`;
  return rows.map((product) => `
    <tr>
      <td><strong>${esc(L(product, 'name'))}</strong><div class="small muted">${esc(getLang() === 'en' ? product.name_zh : product.name_en)}</div></td>
      <td>${esc(L(product, 'category_name') || t('uncategorized'))}</td>
      <td class="num">${esc(money(product.price))}</td>
      <td>${esc(product.sessions)}</td>
      <td>${product.active ? `<span class="pill">${esc(t('active'))}</span>` : `<span class="pill pill-off">${esc(t('inactive'))}</span>`}</td>
      <td class="row-actions">
        <button type="button" class="btn" data-act="open-product" data-id="${product.id}">${esc(t('edit'))}</button>
        <button type="button" class="btn btn-danger" data-act="delete-product" data-id="${product.id}">${esc(t('delete'))}</button>
      </td>
    </tr>`).join('');
}

function bindProductSearch() {
  const input = document.getElementById('product-q');
  if (!input) return;
  input.oninput = () => {
    state.productQuery = input.value;
    const body = document.getElementById('product-tbody');
    if (body) body.innerHTML = productTableRows(state.products);
  };
}

function ensureCal(query) {
  const day = query.day && /^\d{4}-\d{2}-\d{2}$/.test(query.day) ? query.day : '';
  if (!state.cal) {
    const base = day || todayStr();
    const [year, month] = base.split('-').map(Number);
    state.cal = { y: year, m: month - 1 };
    state.calDay = base;
    state.calAnchor = day || base;
    return;
  }
  if (day && day !== state.calAnchor) {
    const [year, month] = day.split('-').map(Number);
    state.cal = { y: year, m: month - 1 };
    state.calDay = day;
    state.calAnchor = day;
  }
}

function monthCells(year, month) {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - first.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

async function calendarHtml(token) {
  ensureCal(state.route.query);
  const cells = monthCells(state.cal.y, state.cal.m);
  const from = ymd(cells[0]);
  const to = ymd(cells[cells.length - 1]);
  const [appointments, directory] = await Promise.all([
    api.get(`/api/appointments?from=${from}&to=${to}`),
    api.get('/api/members'),
  ]);
  if (token !== state.token) return null;
  state.appointments = appointments;
  state.directory = directory;
  const byDay = {};
  appointments.forEach((appt) => {
    if (!byDay[appt.appt_date]) byDay[appt.appt_date] = [];
    byDay[appt.appt_date].push(appt);
  });
  const today = todayStr();
  const grid = cells.map((date) => {
    const key = ymd(date);
    const list = byDay[key] || [];
    const chips = list.slice(0, 3).map((appt) => `<span class="chip ${esc(appt.status)}">${esc(appt.appt_time)} ${esc(appt.member_name)}</span>`).join('');
    const more = list.length > 3 ? `<span class="small muted">${esc(t('more', { n: list.length - 3 }))}</span>` : '';
    const cls = [date.getMonth() === state.cal.m ? '' : 'out', key === today ? 'today' : '', key === state.calDay ? 'selected' : ''].filter(Boolean).join(' ');
    return `<button type="button" class="day ${cls}" data-act="cal-day" data-day="${key}"><b>${date.getDate()}</b>${chips}${more}</button>`;
  }).join('');
  const dayAppts = (byDay[state.calDay] || []).map((appt) => `
    <div class="appt">
      <strong>${esc(appt.appt_time)} · ${esc(appt.member_name)}</strong> ${statusPill(appt.status)}
      <div>${esc(L(appt, 'title'))}</div>
      ${appt.notes ? `<div class="small muted">${esc(appt.notes)}</div>` : ''}
      <div class="row-actions" style="margin-top:8px">${apptActions(appt)}</div>
    </div>`).join('');
  return `${pageHead(t('calTitle'), '', `<button type="button" class="btn" data-act="cal-today">${esc(t('today'))}</button><button type="button" class="btn btn-gold" data-act="open-appt" data-day="${esc(state.calDay)}">${esc(t('addAppt'))}</button>`)}
    <div class="cal-layout">
      <section class="card">
        <div class="page-head"><h2>${esc(monthTitle(state.cal.y, state.cal.m))}</h2>
          <div class="row-actions"><button type="button" class="btn" data-act="cal-prev">‹</button><button type="button" class="btn" data-act="cal-next">›</button></div>
        </div>
        <div class="cal-grid">
          ${[0, 1, 2, 3, 4, 5, 6].map((index) => `<div class="cal-dow">${esc(weekday(index))}</div>`).join('')}
          ${grid}
        </div>
      </section>
      <aside class="card day-panel">
        <h2>${esc(fmtDate(state.calDay))}</h2>
        ${dayAppts || `<p class="empty">${esc(t('noDayAppt'))}</p>`}
      </aside>
    </div>`;
}

function apptActions(appt) {
  const complete = appt.status === 'scheduled' ? `
    ${appt.entitlement_id ? `<button type="button" class="btn btn-gold" data-act="appt-complete" data-id="${appt.id}" data-redeem="1">${esc(t('completeRedeem'))}</button>` : ''}
    <button type="button" class="btn" data-act="appt-complete" data-id="${appt.id}" data-redeem="0">${esc(t('completeOnly'))}</button>
    <button type="button" class="btn" data-act="appt-cancel" data-id="${appt.id}">${esc(t('cancelAppt'))}</button>` : '';
  return `${complete}
    <button type="button" class="btn" data-act="open-appt" data-id="${appt.id}">${esc(t('edit'))}</button>
    <button type="button" class="btn btn-danger" data-act="delete-appt" data-id="${appt.id}">${esc(t('delete'))}</button>`;
}

function shiftMonth(delta) {
  ensureCal(state.route.query || {});
  const date = new Date(state.cal.y, state.cal.m + delta, 1);
  state.cal = { y: date.getFullYear(), m: date.getMonth() };
  render();
}

function calToday() {
  const day = todayStr();
  const [year, month] = day.split('-').map(Number);
  state.cal = { y: year, m: month - 1 };
  state.calDay = day;
  state.calAnchor = day;
  const hash = `#/calendar?day=${day}`;
  if (location.hash === hash) render();
  else location.hash = hash;
}

function calDay(el) {
  const day = el.dataset.day;
  const [year, month] = day.split('-').map(Number);
  state.cal = { y: year, m: month - 1 };
  state.calDay = day;
  state.calAnchor = day;
  const hash = `#/calendar?day=${day}`;
  if (location.hash === hash) render();
  else location.hash = hash;
}

function settingsHtml() {
  const settings = state.settings;
  const currencies = CURRENCIES.includes(settings.currency) ? CURRENCIES : [settings.currency, ...CURRENCIES];
  return `${pageHead(t('settingsTitle'), t('settingsLede'))}
    <form class="card form-grid" data-act="save-settings">
      ${field(t('companyName'), `<input name="company_name" value="${esc(settings.company_name || '')}">`)}
      ${field(t('companyNameEn'), `<input name="company_name_en" value="${esc(settings.company_name_en || '')}">`)}
      ${field(t('companyAddress'), `<textarea name="address" rows="3">${esc(settings.address || '')}</textarea>`, true)}
      ${field(t('companyPhone'), `<input name="phone" value="${esc(settings.phone || '')}">`)}
      ${field(t('currency'), `<select name="currency">${currencies.map((code) => `<option ${code === settings.currency ? 'selected' : ''}>${code}</option>`).join('')}</select>`)}
      ${field(t('invoiceTitleZh'), `<input name="invoice_title_zh" value="${esc(settings.invoice_title_zh || '')}">`)}
      ${field(t('invoiceTitleEn'), `<input name="invoice_title_en" value="${esc(settings.invoice_title_en || '')}">`)}
      ${field(t('receiptNoteZh'), `<input name="receipt_note_zh" value="${esc(settings.receipt_note_zh || '')}">`)}
      ${field(t('receiptNoteEn'), `<input name="receipt_note_en" value="${esc(settings.receipt_note_en || '')}">`)}
      <div class="full modal-actions"><button class="btn btn-gold" type="submit">${esc(t('save'))}</button></div>
    </form>
    <div class="card">
      <p class="hint">${esc(t('backupHint'))}</p>
      <div class="row-actions" style="margin-top:12px"><button type="button" class="btn" data-act="backup">${esc(t('backup'))}</button></div>
    </div>`;
}

function findMember(id) {
  if (state.profile && String(state.profile.member.id) === String(id)) return state.profile.member;
  return (state.directory || []).concat(state.members || []).find((member) => String(member.id) === String(id));
}

function openMember(el) {
  state.memberCallback = null;
  const member = el?.dataset?.id ? findMember(el.dataset.id) : null;
  openMemberForm(member);
}

function openQuickMember() {
  state.memberCallback = (created) => {
    state.directory = [created, ...(state.directory || []).filter((member) => member.id !== created.id)];
    if (state.draft) state.draft.member_id = String(created.id);
    const input = document.getElementById('member-combo-input');
    if (input) input.value = memberLabel(created);
    const preview = document.getElementById('member-preview');
    if (preview) preview.textContent = created.address || t('noAddress');
  };
  openMemberForm(null);
}

function openMemberForm(member) {
  const gender = member?.gender || '';
  openModal(`<form data-act="save-member" class="form-grid">
      <h2 class="full">${esc(member ? t('edit') : t('newMember'))}</h2>
      <input type="hidden" name="id" value="${esc(member?.id || '')}">
      ${field(t('name'), `<input name="name" required value="${esc(member?.name || '')}">`)}
      ${field(t('phone'), `<input name="phone" value="${esc(member?.phone || '')}">`)}
      ${field(t('email'), `<input name="email" value="${esc(member?.email || '')}">`)}
      ${field(t('gender'), `<select name="gender">
        <option value="">${esc(t('genderUnset'))}</option>
        <option value="female" ${gender === 'female' ? 'selected' : ''}>${esc(t('genderFemale'))}</option>
        <option value="male" ${gender === 'male' ? 'selected' : ''}>${esc(t('genderMale'))}</option>
        <option value="other" ${gender === 'other' ? 'selected' : ''}>${esc(t('genderOther'))}</option>
      </select>`)}
      ${field(t('birthday'), `<input name="birthday" type="date" value="${esc(member?.birthday || '')}">`)}
      ${field(t('address'), `<textarea name="address" rows="3">${esc(member?.address || '')}</textarea>`, true)}
      ${field(t('notes'), `<textarea name="notes" rows="3">${esc(member?.notes || '')}</textarea>`, true)}
      <div class="full modal-actions">
        <button type="button" class="btn" data-act="modal-close">${esc(t('cancel'))}</button>
        <button class="btn btn-gold" type="submit">${esc(t('save'))}</button>
      </div>
    </form>`);
}

async function saveMember(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  if (!String(data.name || '').trim()) {
    toast(t('err_NAME_REQUIRED'));
    return;
  }
  try {
    const saved = data.id ? await api.put(`/api/members/${data.id}`, data) : await api.post('/api/members', data);
    const callback = state.memberCallback;
    state.memberCallback = null;
    closeModal();
    toast(t('saved'));
    if (callback) callback(saved);
    else render();
  } catch (error) {
    showError(error);
  }
}

async function deleteMember(el) {
  if (!await confirmBox(t('confirmDeleteMember'), t('delete'))) return;
  try {
    await api.del(`/api/members/${el.dataset.id}`);
    toast(t('deleted'));
    location.hash = '#/members';
  } catch (error) {
    showError(error);
  }
}

function incRow(item = {}) {
  return `<div class="inc-row">
    <input name="inc_zh" value="${esc(item.name_zh || '')}" placeholder="${esc(t('nameZh'))}">
    <input name="inc_en" value="${esc(item.name_en || '')}" placeholder="${esc(t('nameEn'))}">
    <input name="inc_sessions" type="number" min="1" value="${esc(item.sessions || 1)}">
    <button type="button" class="btn btn-ghost" data-act="inc-del">×</button>
  </div>`;
}

function openPackage(el) {
  const pkg = el?.dataset?.id ? state.packages.find((item) => String(item.id) === String(el.dataset.id)) : null;
  const items = pkg?.items?.length ? pkg.items.map(incRow).join('') : '';
  openModal(`<form data-act="save-package" class="form-grid">
    <h2 class="full">${esc(pkg ? t('editPackage') : t('newPackage'))}</h2>
    <input type="hidden" name="id" value="${esc(pkg?.id || '')}">
    ${field(t('nameZh'), `<input name="name_zh" value="${esc(pkg?.name_zh || '')}">`)}
    ${field(t('nameEn'), `<input name="name_en" value="${esc(pkg?.name_en || '')}">`)}
    ${field(t('price'), `<input name="price" type="number" min="0" step="0.01" value="${esc(pkg?.price ?? 0)}">`)}
    ${field(t('packageSessions'), `<input name="sessions" type="number" min="1" value="${esc(pkg?.sessions || 10)}">`)}
    ${field(t('descZh'), `<textarea name="description_zh" rows="2">${esc(pkg?.description_zh || '')}</textarea>`, true)}
    ${field(t('descEn'), `<textarea name="description_en" rows="2">${esc(pkg?.description_en || '')}</textarea>`, true)}
    ${pkg ? field(t('activeLabel'), `<select name="active"><option value="1" ${pkg.active ? 'selected' : ''}>${esc(t('enabled'))}</option><option value="0" ${pkg.active ? '' : 'selected'}>${esc(t('inactive'))}</option></select>`) : ''}
    <div class="full"><p class="hint">${esc(t('includedHint'))}</p><div id="inc-rows" style="margin-top:8px">${items}</div>
      <button type="button" class="btn" data-act="inc-add">${esc(t('addIncluded'))}</button></div>
    <div class="full modal-actions">
      <button type="button" class="btn" data-act="modal-close">${esc(t('cancel'))}</button>
      <button class="btn btn-gold" type="submit">${esc(t('save'))}</button>
    </div>
  </form>`);
}

function incAdd() {
  const rows = document.getElementById('inc-rows');
  if (rows) rows.insertAdjacentHTML('beforeend', incRow());
}

async function savePackage(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  const zh = [...form.querySelectorAll('[name="inc_zh"]')].map((input) => input.value);
  const en = [...form.querySelectorAll('[name="inc_en"]')].map((input) => input.value);
  const sessions = [...form.querySelectorAll('[name="inc_sessions"]')].map((input) => input.value);
  const items = zh.map((name, index) => ({ name_zh: name, name_en: en[index], sessions: sessions[index] })).filter((item) => item.name_zh.trim() || item.name_en.trim());
  const body = { ...data, items };
  try {
    if (data.id) await api.put(`/api/packages/${data.id}`, body);
    else await api.post('/api/packages', body);
    closeModal();
    toast(t('saved'));
    render();
  } catch (error) {
    showError(error);
  }
}

async function deletePackage(el) {
  if (!await confirmBox(t('confirmDeletePkg'), t('delete'))) return;
  try {
    const result = await api.del(`/api/packages/${el.dataset.id}`);
    toast(result.deactivated ? t('deactivated') : t('deleted'));
    render();
  } catch (error) {
    showError(error);
  }
}

function openCategory(el) {
  const category = el?.dataset?.id ? state.categories.find((item) => String(item.id) === String(el.dataset.id)) : null;
  openModal(`<form data-act="save-category" class="form-grid">
    <h2 class="full">${esc(category ? t('editCategory') : t('newCategory'))}</h2>
    <input type="hidden" name="id" value="${esc(category?.id || '')}">
    ${field(t('nameZh'), `<input name="name_zh" value="${esc(category?.name_zh || '')}">`)}
    ${field(t('nameEn'), `<input name="name_en" value="${esc(category?.name_en || '')}">`)}
    <div class="full modal-actions">
      <button type="button" class="btn" data-act="modal-close">${esc(t('cancel'))}</button>
      <button class="btn btn-gold" type="submit">${esc(t('save'))}</button>
    </div>
  </form>`);
}

async function saveCategory(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  try {
    if (data.id) await api.put(`/api/categories/${data.id}`, data);
    else await api.post('/api/categories', data);
    closeModal();
    toast(t('saved'));
    render();
  } catch (error) {
    showError(error);
  }
}

async function deleteCategory(el) {
  if (!await confirmBox(t('confirmDeleteCat'), t('delete'))) return;
  try {
    await api.del(`/api/categories/${el.dataset.id}`);
    toast(t('deleted'));
    if (String(state.route.query.cat) === String(el.dataset.id)) location.hash = '#/products';
    else render();
  } catch (error) {
    showError(error);
  }
}

function openProduct(el) {
  const product = el?.dataset?.id ? state.products.find((item) => String(item.id) === String(el.dataset.id)) : null;
  const options = [`<option value="">${esc(t('uncategorized'))}</option>`].concat(state.categories.map((category) =>
    `<option value="${category.id}" ${String(product?.category_id) === String(category.id) ? 'selected' : ''}>${esc(L(category, 'name'))}</option>`)).join('');
  openModal(`<form data-act="save-product" class="form-grid">
    <h2 class="full">${esc(product ? t('editProduct') : t('newProduct'))}</h2>
    <input type="hidden" name="id" value="${esc(product?.id || '')}">
    ${field(t('nameZh'), `<input name="name_zh" value="${esc(product?.name_zh || '')}">`)}
    ${field(t('nameEn'), `<input name="name_en" value="${esc(product?.name_en || '')}">`)}
    ${field(t('category'), `<select name="category_id">${options}</select>`)}
    ${field(t('price'), `<input name="price" type="number" min="0" step="0.01" value="${esc(product?.price ?? 0)}">`)}
    ${field(t('sessionsField'), `<input name="sessions" type="number" min="0" value="${esc(product?.sessions ?? 1)}">`)}
    ${field(t('activeLabel'), `<select name="active"><option value="1" ${product?.active !== 0 ? 'selected' : ''}>${esc(t('enabled'))}</option><option value="0" ${product && !product.active ? 'selected' : ''}>${esc(t('inactive'))}</option></select>`)}
    <p class="full hint">${esc(t('goodsHint'))}</p>
    <div class="full modal-actions">
      <button type="button" class="btn" data-act="modal-close">${esc(t('cancel'))}</button>
      <button class="btn btn-gold" type="submit">${esc(t('save'))}</button>
    </div>
  </form>`);
}

async function saveProduct(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  try {
    if (data.id) await api.put(`/api/products/${data.id}`, data);
    else await api.post('/api/products', data);
    closeModal();
    toast(t('saved'));
    render();
  } catch (error) {
    showError(error);
  }
}

async function deleteProduct(el) {
  if (!await confirmBox(t('confirmDeleteProduct'), t('delete'))) return;
  try {
    const result = await api.del(`/api/products/${el.dataset.id}`);
    toast(result.deactivated ? t('deactivated') : t('deleted'));
    render();
  } catch (error) {
    showError(error);
  }
}

async function deleteOrder(id) {
  if (!await confirmBox(t('confirmDeleteOrder'), t('delete'))) return;
  try {
    await api.del(`/api/orders/${id}`);
    toast(t('deleted'));
    location.hash = '#/orders';
  } catch (error) {
    showError(error);
  }
}

async function useSession(id) {
  try {
    const data = await api.post(`/api/entitlements/${id}/use`, { count: 1, used_on: todayStr() });
    toast(t('usedOk', { n: data.remaining }), { act: 'undo-log', id: data.log_id, label: t('undo') });
    render();
  } catch (error) {
    showError(error);
  }
}

function openAdjust(el) {
  openModal(`<form data-act="save-adjust" class="form-grid">
    <h2 class="full">${esc(t('adjustTitle'))}</h2>
    <input type="hidden" name="id" value="${esc(el.dataset.id)}">
    ${field(t('adjustUsed'), `<input name="used_sessions" type="number" min="0" max="${esc(el.dataset.total)}" value="${esc(el.dataset.used)}">`, true)}
    ${field(t('adjustReason'), `<input name="notes" required>`, true)}
    <div class="full modal-actions">
      <button type="button" class="btn" data-act="modal-close">${esc(t('cancel'))}</button>
      <button class="btn btn-gold" type="submit">${esc(t('save'))}</button>
    </div>
  </form>`);
}

async function saveAdjust(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  try {
    await api.post(`/api/entitlements/${data.id}/adjust`, data);
    closeModal();
    toast(t('saved'));
    render();
  } catch (error) {
    showError(error);
  }
}

async function undoLog(el) {
  try {
    await api.post(`/api/session-logs/${el.dataset.id}/undo`, {});
    toast(t('deleted'));
    render();
  } catch (error) {
    showError(error);
  }
}

async function revokeLog(el) {
  if (!await confirmBox(t('confirmRevoke'), t('undo'))) return;
  return undoLog(el);
}

async function openAppt(el) {
  try {
    if (!state.directory?.length) state.directory = await api.get('/api/members');
  } catch (error) {
    showError(error);
    return;
  }
  const existing = (state.appointments || []).find((appt) => String(appt.id) === String(el.dataset.id || ''));
  const memberId = existing?.member_id || el.dataset.member || '';
  const options = state.directory.map((member) =>
    `<option value="${member.id}" ${String(member.id) === String(memberId) ? 'selected' : ''}>${esc(member.member_no)} ${esc(member.name)}</option>`).join('');
  openModal(`<form data-act="save-appt" class="form-grid">
    <h2 class="full">${esc(existing ? t('editAppt') : t('addAppt'))}</h2>
    <input type="hidden" name="id" value="${esc(existing?.id || '')}">
    <input type="hidden" name="title_zh" id="appt-title-zh" value="${esc(existing?.title_zh || '')}">
    <input type="hidden" name="title_en" id="appt-title-en" value="${esc(existing?.title_en || '')}">
    ${field(t('members'), `<select name="member_id" id="appt-member" required><option value="">${esc(t('allMembers'))}</option>${options}</select>`, true)}
    ${field(t('date'), `<input name="appt_date" type="date" required value="${esc(existing?.appt_date || el.dataset.day || state.calDay || todayStr())}">`)}
    ${field(t('time'), `<input name="appt_time" type="time" value="${esc(existing?.appt_time || '11:00')}">`)}
    ${field(t('linkSession'), `<select name="entitlement_id" id="appt-ent"><option value="">${esc(t('noLink'))}</option></select>`, true)}
    ${field(t('apptService'), `<input name="title" id="appt-title" value="${esc(existing ? L(existing, 'title') : '')}">`, true)}
    ${field(t('notes'), `<textarea name="notes" rows="2">${esc(existing?.notes || '')}</textarea>`, true)}
    <div class="full modal-actions">
      <button type="button" class="btn" data-act="modal-close">${esc(t('cancel'))}</button>
      <button class="btn btn-gold" type="submit">${esc(t('save'))}</button>
    </div>
  </form>`);
  const select = document.getElementById('appt-member');
  const ent = document.getElementById('appt-ent');
  select.onchange = () => loadApptBalances(select.value);
  ent.onchange = () => {
    const picked = state.apptEntitlements.find((row) => String(row.id) === ent.value);
    if (!picked) return;
    document.getElementById('appt-title-zh').value = picked.name_zh;
    document.getElementById('appt-title-en').value = picked.name_en;
    document.getElementById('appt-title').value = L(picked, 'name');
  };
  if (memberId) loadApptBalances(memberId, existing?.entitlement_id);
}

async function loadApptBalances(memberId, selected) {
  const select = document.getElementById('appt-ent');
  if (!select) return;
  if (!memberId) {
    select.innerHTML = `<option value="">${esc(t('noLink'))}</option>`;
    return;
  }
  try {
    const profile = await api.get(`/api/members/${memberId}/profile`);
    state.apptEntitlements = profile.entitlements.filter((ent) => ent.remaining > 0 || String(ent.id) === String(selected || ''));
    select.innerHTML = `<option value="">${esc(t('noLink'))}</option>` + state.apptEntitlements.map((ent) =>
      `<option value="${ent.id}" ${String(selected) === String(ent.id) ? 'selected' : ''}>${esc(L(ent, 'name'))} · ${esc(t('leftTimes', { n: ent.remaining }))}</option>`).join('');
  } catch (error) {
    showError(error);
  }
}

async function saveAppt(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  const body = {
    member_id: data.member_id,
    entitlement_id: data.entitlement_id,
    appt_date: data.appt_date,
    appt_time: data.appt_time,
    notes: data.notes,
    title_zh: getLang() === 'zh' ? data.title : (data.title_zh || data.title),
    title_en: getLang() === 'en' ? data.title : (data.title_en || data.title),
  };
  try {
    if (data.id) await api.put(`/api/appointments/${data.id}`, body);
    else await api.post('/api/appointments', body);
    closeModal();
    toast(t('savedAppt'));
    render();
  } catch (error) {
    showError(error);
  }
}

async function apptComplete(el) {
  try {
    await api.post(`/api/appointments/${el.dataset.id}/complete`, { redeem: el.dataset.redeem !== '0' });
    toast(t('savedAppt'));
    render();
  } catch (error) {
    showError(error);
  }
}

async function apptCancel(id) {
  if (!await confirmBox(t('confirmCancelAppt'))) return;
  try {
    await api.post(`/api/appointments/${id}/cancel`, {});
    toast(t('savedAppt'));
    render();
  } catch (error) {
    showError(error);
  }
}

async function deleteAppt(id) {
  if (!await confirmBox(t('confirmDeleteAppt'), t('delete'))) return;
  try {
    await api.del(`/api/appointments/${id}`);
    toast(t('deleted'));
    render();
  } catch (error) {
    showError(error);
  }
}

async function saveSettings(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  try {
    state.settings = await api.put('/api/settings', data);
    toast(t('savedSettings'));
  } catch (error) {
    showError(error);
  }
}

function exportOrders() {
  const q = queryString({ ...state.route.query, lang: getLang() });
  downloadUrl(`/api/orders/export.csv${q ? `?${q}` : ''}`);
}

const actions = {
  lang: (el) => setLanguage(el.dataset.lang),
  'modal-close': () => closeModal(),
  'confirm-yes': () => confirmYes(),
  'confirm-no': () => closeModal(),
  'open-member': (el) => openMember(el),
  'open-quick-member': () => openQuickMember(),
  'save-member': (form) => saveMember(form),
  'delete-member': (el) => deleteMember(el),
  'open-package': (el) => openPackage(el),
  'save-package': (form) => savePackage(form),
  'delete-package': (el) => deletePackage(el),
  'inc-add': () => incAdd(),
  'inc-del': (el) => el.closest('.inc-row')?.remove(),
  'open-category': (el) => openCategory(el),
  'save-category': (form) => saveCategory(form),
  'delete-category': (el) => deleteCategory(el),
  'open-product': (el) => openProduct(el),
  'save-product': (form) => saveProduct(form),
  'delete-product': (el) => deleteProduct(el),
  tab: (el) => setTab(el.dataset.tab),
  'add-package': (el) => addCatalog('package', el.dataset.id),
  'add-product': (el) => addCatalog('product', el.dataset.id),
  'add-custom': (form) => addCustom(form),
  'draft-inc': (el) => changeQty(el.dataset.key, 1),
  'draft-dec': (el) => changeQty(el.dataset.key, -1),
  'draft-del': (el) => removeDraftItem(el.dataset.key),
  'clear-draft': () => clearDraft(),
  'save-order': () => saveOrder(),
  'pick-member': (el) => pickMember(el.dataset.id),
  'delete-order': (el) => deleteOrder(el.dataset.id),
  'print-sheet': () => window.print(),
  'download-sheet': () => downloadCurrent(),
  'switch-template': (el) => switchTemplate(el),
  'use-session': (el) => useSession(el.dataset.id),
  'open-adjust': (el) => openAdjust(el),
  'save-adjust': (form) => saveAdjust(form),
  'undo-log': (el) => undoLog(el),
  'revoke-log': (el) => revokeLog(el),
  'open-appt': (el) => openAppt(el),
  'save-appt': (form) => saveAppt(form),
  'delete-appt': (el) => deleteAppt(el.dataset.id),
  'appt-complete': (el) => apptComplete(el),
  'appt-cancel': (el) => apptCancel(el.dataset.id),
  'cal-prev': () => shiftMonth(-1),
  'cal-next': () => shiftMonth(1),
  'cal-today': () => calToday(),
  'cal-day': (el) => calDay(el),
  'save-settings': (form) => saveSettings(form),
  backup: () => downloadUrl('/api/backup'),
  'export-orders': () => exportOrders(),
  'export-member': (el) => downloadUrl(`/api/members/${el.dataset.id}/export.csv?lang=${getLang()}`),
  'clear-order-filter': () => clearOrderFilter(),
};

document.addEventListener('click', (event) => {
  if (!event.target.closest('.top-search')) {
    const pop = document.getElementById('search-pop');
    if (pop) pop.hidden = true;
  }
  const el = event.target.closest('[data-act]');
  if (!el || el.tagName === 'A' || el.tagName === 'FORM') return;
  const fn = actions[el.dataset.act];
  if (!fn) return;
  event.preventDefault();
  fn(el, event);
});

document.addEventListener('submit', (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  const fn = actions[form.dataset.act];
  if (!fn) return;
  event.preventDefault();
  fn(form, event);
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeModal();
});

async function boot() {
  try {
    const data = await api.get('/api/bootstrap');
    state.settings = data.settings;
    let saved = '';
    try { saved = localStorage.getItem('bianmore-lang') || ''; } catch { /* ignore */ }
    setLang(saved || data.settings.lang || 'zh');
    state.route = parseRoute();
    renderShell();
    if (salonDb.meta?.initialized) toast(t('dbReady'));
    else if (salonDb.meta?.volatile) toast(t('dbVolatile'));
    if (!location.hash) history.replaceState(null, '', '#/dashboard');
    await render();
    window.addEventListener('hashchange', () => {
      const pop = document.getElementById('search-pop');
      if (pop) pop.hidden = true;
      const input = document.getElementById('global-search');
      if (input) input.value = '';
      render();
    });
  } catch (error) {
    document.getElementById('app').innerHTML = `<div class="boot-error"><h1>變MORE髮</h1><p>${esc(errText(error))}</p></div>`;
  }
}

boot();
