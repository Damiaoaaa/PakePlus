function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function dollar(value) {
  const number = Number(value || 0);
  const abs = Math.abs(number).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${number < 0 ? '-' : ''}$${abs}`;
}

function dmy(value) {
  if (!value) return '';
  const [year, month, day] = String(value).slice(0, 10).split('-');
  if (!day) return String(value);
  return `${day}/${month}/${year}`;
}

function L(row, field) {
  if (!row) return '';
  const zh = row[`${field}_zh`];
  const en = row[`${field}_en`];
  return getLang() === 'en' ? (en || zh || '') : (zh || en || '');
}

function ornament() {
  return `<svg class="ornament ornament-tr" viewBox="0 0 240 320" aria-hidden="true">
    <g fill="none" stroke="#c4a36a" stroke-linecap="round">
      <path d="M210 24c-46 12-58 78-104 88" stroke-width="1.4"/>
      <path d="M224 54c-58 10-70 96-128 108" stroke-width="1.05"/>
      <path d="M232 86c-64 8-78 112-146 126" stroke-width="0.8"/>
      <path d="M70 250c28-46 62-62 96-104" stroke-width="1"/>
      <path d="M46 272c36-52 78-66 118-118" stroke-width="0.75"/>
    </g>
  </svg>
  <svg class="ornament ornament-bl" viewBox="0 0 240 320" aria-hidden="true">
    <g fill="none" stroke="#c4a36a" stroke-linecap="round">
      <path d="M210 24c-46 12-58 78-104 88" stroke-width="1.4"/>
      <path d="M224 54c-58 10-70 96-128 108" stroke-width="1.05"/>
      <path d="M232 86c-64 8-78 112-146 126" stroke-width="0.8"/>
    </g>
  </svg>`;
}

function noteItems(settings, order) {
  const notes = [];
  const custom = getLang() === 'en' ? settings.receipt_note_en : settings.receipt_note_zh;
  if (custom) notes.push(custom);
  if (order?.notes) notes.push(order.notes);
  const hasSessions = (order?.items || []).some((item) => Number(item.sessions) > 0) || (order?.entitlements || []).length > 0;
  if (hasSessions) notes.push(t('sessionsFollow'));
  if (!notes.length) return '';
  return `<ul class="sheet-notes">${notes.map((note) => `<li>${esc(note)}</li>`).join('')}</ul>`;
}

function footer(settings) {
  const phone = settings.phone ? `<div>${esc(t('telLine'))} ${esc(settings.phone)}</div>` : '';
  return `<footer class="sheet-foot"><div>${esc(settings.address || '')}</div>${phone}</footer>`;
}

function titleOf(settings) {
  return getLang() === 'en'
    ? (settings.invoice_title_en || 'Invoice')
    : (settings.invoice_title_zh || '發票');
}

function invoiceSheet(model) {
  const { settings, order } = model;
  const rows = order.items.map((item, index) => `
    <tr>
      <td class="c-item">${index + 1}</td>
      <td class="desc">${esc(L(item, 'description'))}</td>
      <td class="c-qty">${esc(item.quantity)}</td>
      <td class="c-amt">${dollar(item.amount)}</td>
    </tr>`).join('');
  const address = order.address ? `<p class="addr">${esc(order.address)}</p>` : '';
  const phone = order.phone ? `<p>${esc(t('telLine'))} ${esc(order.phone)}</p>` : '';
  return `<article class="sheet invoice">
    ${ornament()}
    <div class="wm">變MORE髮</div>
    <header class="sheet-top">
      <img class="sheet-logo" src="public/assets/logo.png" alt="變MORE髮">
      <h1>${esc(titleOf(settings))}</h1>
    </header>
    <div class="sheet-meta">
      <div class="sheet-to">
        <p class="who"><b>${esc(t('toLine'))}</b> ${esc(order.member_name)}</p>
        <p>${esc(t('memberLine'))} ${esc(order.member_no)}</p>
        ${address}
        ${phone}
      </div>
      <div class="sheet-date">
        <p>${esc(t('dateLine'))} ${esc(dmy(order.order_date))}</p>
        <p class="orderno">${esc(t('noLine'))} ${esc(order.order_no)}</p>
      </div>
    </div>
    <table class="sheet-table">
      <thead>
        <tr>
          <th class="c-item">${esc(t('item'))}</th>
          <th>${esc(t('description'))}</th>
          <th class="c-qty">${esc(t('quantity'))}</th>
          <th class="c-amt">${esc(t('colAmount'))}</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="sheet-total">
      <span>${esc(t('totalWord'))} ${esc(order.currency)}</span>
      <strong>${dollar(order.total)}</strong>
    </div>
    ${noteItems(settings, order)}
    ${footer(settings)}
  </article>`;
}

function compactSheet(model) {
  const { settings, order } = model;
  const rows = order.items.map((item) => `
    <tr>
      <td class="desc">${esc(L(item, 'description'))}</td>
      <td class="num">${esc(item.quantity)}</td>
      <td class="num">${dollar(item.amount)}</td>
    </tr>`).join('');
  const balances = (order.entitlements || []).map((ent) => `
    <li><span>${esc(L(ent, 'name'))}</span><b>${esc(t('currentLeft'))} ${esc(ent.remaining)}/${esc(ent.total_sessions)}</b></li>`).join('');
  return `<article class="sheet compact">
    <img class="sheet-logo" src="public/assets/logo.png" alt="變MORE髮">
    <h1>${esc(titleOf(settings))}</h1>
    <p class="center muted">${esc(settings.address || '')}</p>
    <div class="rule"></div>
    <div class="compact-meta">
      <p>${esc(t('noLine'))} ${esc(order.order_no)}</p>
      <p>${esc(t('dateLine'))} ${esc(dmy(order.order_date))}</p>
      <p>${esc(t('toLine'))} ${esc(order.member_name)} · ${esc(order.member_no)}</p>
      ${order.phone ? `<p>${esc(t('telLine'))} ${esc(order.phone)}</p>` : ''}
    </div>
    <table class="compact-table">
      <thead><tr><th>${esc(t('description'))}</th><th class="num">${esc(t('qty'))}</th><th class="num">${esc(t('colAmount'))}</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="compact-total"><span>${esc(t('totalWord'))} ${esc(order.currency)}</span><span>${dollar(order.total)}</span></div>
    ${balances ? `<ul class="balance-list">${balances}</ul>` : ''}
    ${noteItems(settings, order)}
  </article>`;
}

function firstLine(text) {
  return String(text || '').split('\n')[0];
}

function todayLocal() {
  const date = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

function sessionSheet(model) {
  const { settings, profile } = model;
  const member = profile.member;
  const balances = profile.entitlements.length
    ? profile.entitlements.map((ent) => `
      <tr>
        <td class="desc">${esc(L(ent, 'name'))}<br><span>${esc(ent.order_no)} · ${esc(dmy(ent.order_date))}</span></td>
        <td class="c-qty">${esc(ent.total_sessions)}</td>
        <td class="c-qty">${esc(ent.used_sessions)}</td>
        <td class="c-amt">${esc(ent.remaining)}</td>
      </tr>`).join('')
    : `<tr><td class="desc" colspan="4">${esc(t('noEntitlement'))}</td></tr>`;
  const purchases = [];
  for (const order of profile.orders) {
    for (const item of order.items) {
      purchases.push(`<tr>
        <td>${esc(dmy(order.order_date))}</td>
        <td>${esc(order.order_no)}</td>
        <td class="desc">${esc(firstLine(L(item, 'description')))}</td>
        <td class="c-amt">${dollar(item.amount)}</td>
      </tr>`);
    }
  }
  const purchaseRows = purchases.length ? purchases.join('') : `<tr><td colspan="4">${esc(t('noPurchase'))}</td></tr>`;
  return `<article class="sheet invoice">
    ${ornament()}
    <div class="wm">變MORE髮</div>
    <header class="sheet-top">
      <img class="sheet-logo" src="public/assets/logo.png" alt="變MORE髮">
      <h1>${esc(t('treatmentCard'))}</h1>
    </header>
    <div class="sheet-meta">
      <div class="sheet-to">
        <p><b>${esc(t('toLine'))}</b> ${esc(member.name)}</p>
        <p>${esc(t('memberLine'))} ${esc(member.member_no)}</p>
        ${member.address ? `<p class="addr">${esc(member.address)}</p>` : ''}
        ${member.phone ? `<p>${esc(t('telLine'))} ${esc(member.phone)}</p>` : ''}
      </div>
      <div class="sheet-date"><p>${esc(t('dateLine'))} ${esc(dmy(todayLocal()))}</p></div>
    </div>
    <p class="section-label">${esc(t('entitlements'))}</p>
    <table class="sheet-table">
      <thead>
        <tr>
          <th>${esc(t('description'))}</th>
          <th class="c-qty">${esc(getLang() === 'en' ? 'Total' : '總次數')}</th>
          <th class="c-qty">${esc(getLang() === 'en' ? 'Used' : '已用')}</th>
          <th class="c-amt">${esc(getLang() === 'en' ? 'Left' : '剩餘')}</th>
        </tr>
      </thead>
      <tbody>${balances}</tbody>
    </table>
    <p class="section-label">${esc(t('purchaseHistory'))}</p>
    <table class="sheet-table">
      <thead>
        <tr>
          <th class="c-qty">${esc(t('date'))}</th>
          <th class="c-qty">${esc(t('orderNo'))}</th>
          <th>${esc(t('description'))}</th>
          <th class="c-amt">${esc(t('colAmount'))}</th>
        </tr>
      </thead>
      <tbody>${purchaseRows}</tbody>
    </table>
    ${footer(settings)}
  </article>`;
}

function sheetHtml(kind, model) {
  if (kind === 'session') return sessionSheet(model);
  if (kind === 'compact') return compactSheet(model);
  return invoiceSheet(model);
}

async function downloadSheet(kind, model) {
  const inner = sheetHtml(kind, model).replaceAll('public/assets/logo.png', BRAND_LOGO);
  const title = kind === 'session' ? t('treatmentCard') : titleOf(model.settings);
  const html = `<!DOCTYPE html><html lang="${getLang() === 'en' ? 'en' : 'zh-Hant'}"><head><meta charset="UTF-8"><title>${esc(title)} · 變MORE髮</title><style>${RECEIPT_CSS}</style></head><body class="receipt-export">${inner}</body></html>`;
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  const stamp = kind === 'session' ? model.profile.member.member_no : model.order.order_no;
  link.download = `${title}-${stamp}.html`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
