/* ─────────────────────────────────────────────────────────
   middletncre.com — main.js
   Pulls live CSV data from two published Google Sheets
───────────────────────────────────────────────────────── */

const SHEETS = {
  lease: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTLbr7xruGdQ6hV2CU_9XNWXuJuB4hE3j888b-EgNl5KVE-gLUzqirhzaGfKF197Q/pub?gid=719245756&single=true&output=csv',
  sale:  'https://docs.google.com/spreadsheets/d/e/2PACX-1vRhg2RYozHTpwXnYgY3t3WrWQptz28GnGgVm1gqoQr6jcn8oZnQ2xBVzT7GfWVrmA/pub?gid=637560717&single=true&output=csv',
};

const PAGE_SIZE = 25;

let state = {
  activeTab: 'lease',
  lease: { raw: [], filtered: [], sortCol: null, sortDir: 'asc', page: 1 },
  sale:  { raw: [], filtered: [], sortCol: null, sortDir: 'asc', page: 1 },
};

/* ── CSV PARSER ── */
function parseCSV(text) {
  // Strip BOM if present
  text = text.replace(/^\uFEFF/, '');
  
  const rows = [];
  let cur = '', inQ = false, row = [];

  for (let i = 0; i <= text.length; i++) {
    const c = text[i];
    if (c === '"') { inQ = !inQ; continue; }
    if (c === ',' && !inQ) { row.push(cur.trim()); cur = ''; continue; }
    if ((c === '\n' || c === '\r' || c === undefined) && !inQ) {
      row.push(cur.trim()); cur = '';
      if (row.some(v => v)) rows.push(row);
      row = [];
      if (text[i+1] === '\n') i++;
      continue;
    }
    cur += c;
  }

  if (rows.length < 2) return [];

  // Clean headers — strip BOM, quotes, whitespace
  const headers = rows[0].map(h => h.replace(/[\uFEFF"]/g, '').trim());
  console.log('Headers found:', headers);

  return rows.slice(1).map(cells => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (cells[i] || '').trim(); });
    return obj;
  });
}

/* ── FETCH ── */
async function fetchSheet(type) {
  const res = await fetch(SHEETS[type]);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  return parseCSV(text);
}

/* ── FORMAT HELPERS ── */
const fmt = {
  money: v => {
    if (!v) return '—';
    const n = parseFloat(v.replace(/[^0-9.]/g, ''));
    if (isNaN(n)) return v;
    if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(2) + 'M';
    if (n >= 1_000) return '$' + n.toLocaleString();
    return '$' + n.toFixed(2);
  },
  sf: v => {
    if (!v) return '—';
    const n = parseFloat(v.replace(/[^0-9.]/g, ''));
    return isNaN(n) ? v : n.toLocaleString() + ' SF';
  },
  psf: v => {
    if (!v) return '—';
    const n = parseFloat(v.replace(/[^0-9.]/g, ''));
    return isNaN(n) ? v : '$' + n.toFixed(2) + '/SF';
  },
  pct: v => {
    if (!v) return '—';
    return v.includes('%') ? v : v + '%';
  },
  date: v => v || '—',
  plain: v => v || '—',
  classBadge: v => {
    if (!v) return '—';
    const cls = v.trim().toUpperCase().replace('CLASS ', '');
    const map = { A: 'class-a', B: 'class-b', C: 'class-c' };
    return `<span class="class-badge ${map[cls] || ''}">${cls}</span>`;
  },
};

/* ── LEASE TABLE COLUMNS ── */
const LEASE_COLS = [
  { key: 'Address',                  label: 'Address',      render: r => `<span class="bold">${fmt.plain(r['Address'])}</span>` },
  { key: 'City',                     label: 'City',         render: r => fmt.plain(r['City']) },
  { key: 'Submarket',                label: 'Submarket',    render: r => fmt.plain(r['Submarket']) },
  { key: 'Building Class',           label: 'Class',        render: r => fmt.classBadge(r['Building Class']) },
  { key: 'Lease Size',               label: 'Lease Size',   render: r => `<span class="bold">${fmt.sf(r['Lease Size'])}</span>` },
  { key: 'Transaction Type',         label: 'Trans. Type',  render: r => fmt.plain(r['Transaction Type']) },
  { key: 'First Year Rent per area', label: 'Rate/SF',      render: r => `<span class="money">${fmt.psf(r['First Year Rent per area'])}</span>` },
  { key: 'Rent Type',                label: 'Rent Type',    render: r => fmt.plain(r['Rent Type']) },
  { key: 'Term (mos)',               label: 'Term',         render: r => r['Term (mos)'] ? r['Term (mos)'] + ' mos' : '—' },
  { key: 'Sign Date',                label: 'Sign Date',    render: r => fmt.date(r['Sign Date']) },
  { key: 'Commencement Date',        label: 'Commence',     render: r => `<span class="dim">${fmt.date(r['Commencement Date'])}</span>` },
  { key: 'Expiration Date',          label: 'Expiration',   render: r => `<span class="dim">${fmt.date(r['Expiration Date'])}</span>` },
  { key: 'TIs per SF',               label: 'TI/SF',        render: r => fmt.psf(r['TIs per SF']) },
  { key: 'Escalation',               label: 'Escalation',   render: r => fmt.plain(r['Escalation']) },
  { key: 'Free Rent (mos)',          label: 'Free Rent',    render: r => r['Free Rent (mos)'] ? r['Free Rent (mos)'] + ' mos' : '—' },
];

/* ── SALE TABLE COLUMNS ── */
const SALE_COLS = [
  { key: 'Property Address', label: 'Address',    render: r => `<span class="bold">${fmt.plain(r['Property Address'])}</span>` },
  { key: 'Property Name',    label: 'Property',   render: r => fmt.plain(r['Property Name']) },
  { key: 'City',             label: 'City',       render: r => fmt.plain(r['City']) },
  { key: 'Market',           label: 'Submarket',  render: r => fmt.plain(r['Market']) },
  { key: 'Class Building',   label: 'Class',      render: r => fmt.classBadge(r['Class Building']) },
  { key: 'Total SF',         label: 'Total SF',   render: r => `<span class="bold">${fmt.sf(r['Total SF'])}</span>` },
  { key: 'Sale Price',       label: 'Sale Price', render: r => `<span class="money">${fmt.money(r['Sale Price'])}</span>` },
  { key: '$PSF',             label: '$/SF',       render: r => `<span class="money">${fmt.psf(r['$PSF'])}</span>` },
  { key: 'Cap Rate',         label: 'Cap Rate',   render: r => fmt.pct(r['Cap Rate']) },
  { key: 'Type of Sale',     label: 'Sale Type',  render: r => fmt.plain(r['Type of Sale']) },
  { key: '% Leased',         label: '% Leased',   render: r => fmt.pct(r['% Leased']) },
  { key: 'Seller',           label: 'Seller',     render: r => `<span class="dim">${fmt.plain(r['Seller'])}</span>` },
  { key: 'Buyer',            label: 'Buyer',      render: r => `<span class="dim">${fmt.plain(r['Buyer'])}</span>` },
  { key: 'Sale Date',        label: 'Sale Date',  render: r => fmt.date(r['Sale Date']) },
];

/* ── FILTER FIELDS ── */
const LEASE_FILTERS = [
  { id: 'f-lease-submarket', key: 'Submarket',        type: 'select', label: 'Submarket' },
  { id: 'f-lease-class',     key: 'Building Class',   type: 'select', label: 'Class' },
  { id: 'f-lease-type',      key: 'Transaction Type', type: 'select', label: 'Trans. Type' },
  { id: 'f-lease-renttype',  key: 'Rent Type',        type: 'select', label: 'Rent Type' },
  { id: 'f-lease-search',    key: '_search',          type: 'text',   label: 'Search address…' },
];

const SALE_FILTERS = [
  { id: 'f-sale-submarket', key: 'Market',         type: 'select', label: 'Submarket' },
  { id: 'f-sale-class',     key: 'Class Building', type: 'select', label: 'Class' },
  { id: 'f-sale-type',      key: 'Type of Sale',   type: 'select', label: 'Sale Type' },
  { id: 'f-sale-search',    key: '_search',        type: 'text',   label: 'Search address…' },
];

/* ── BUILD FILTERS ── */
function buildFilters(filters, data, type) {
  const wrap = document.getElementById(`${type}-filters`);
  if (!wrap) return;
  wrap.innerHTML = '';

  filters.forEach(f => {
    if (f.type === 'select') {
      const vals = [...new Set(data.map(r => r[f.key]).filter(Boolean))].sort();
      const sel = document.createElement('select');
      sel.className = 'filter-select'; sel.id = f.id;
      sel.innerHTML = `<option value="">— ${f.label} —</option>` +
        vals.map(v => `<option value="${v}">${v}</option>`).join('');
      sel.addEventListener('change', () => applyFilters(type));
      wrap.appendChild(sel);
    } else {
      const inp = document.createElement('input');
      inp.className = 'filter-input'; inp.id = f.id;
      inp.placeholder = f.label; inp.type = 'text';
      inp.addEventListener('input', () => applyFilters(type));
      wrap.appendChild(inp);
    }
  });

  const reset = document.createElement('button');
  reset.className = 'filter-reset'; reset.textContent = 'Clear filters';
  reset.addEventListener('click', () => {
    filters.forEach(f => { const el = document.getElementById(f.id); if (el) el.value = ''; });
    applyFilters(type);
  });
  wrap.appendChild(reset);
}

/* ── APPLY FILTERS ── */
function applyFilters(type) {
  const filters = type === 'lease' ? LEASE_FILTERS : SALE_FILTERS;
  const s = state[type];
  s.page = 1;

  s.filtered = s.raw.filter(row => {
    return filters.every(f => {
      const el = document.getElementById(f.id);
      if (!el || !el.value) return true;
      if (f.key === '_search') {
        const q = el.value.toLowerCase();
        const addr = type === 'lease' ? row['Address'] : row['Property Address'];
        return (addr || '').toLowerCase().includes(q);
      }
      return row[f.key] === el.value;
    });
  });

  renderTable(type);
}

/* ── SORT ── */
function sortBy(type, key) {
  const s = state[type];
  s.sortCol === key ? s.sortDir = s.sortDir === 'asc' ? 'desc' : 'asc' : (s.sortCol = key, s.sortDir = 'asc');
  s.page = 1;

  s.filtered.sort((a, b) => {
    let av = a[key] || '', bv = b[key] || '';
    const an = parseFloat(av.replace(/[^0-9.-]/g, ''));
    const bn = parseFloat(bv.replace(/[^0-9.-]/g, ''));
    if (!isNaN(an) && !isNaN(bn)) return s.sortDir === 'asc' ? an - bn : bn - an;
    return s.sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
  });

  renderTable(type);
}

/* ── RENDER TABLE ── */
function renderTable(type) {
  const cols = type === 'lease' ? LEASE_COLS : SALE_COLS;
  const s = state[type];
  const wrap = document.getElementById(`${type}-table-wrap`);
  const countEl = document.getElementById(`${type}-count`);
  if (!wrap) return;

  if (countEl) countEl.textContent = `${s.filtered.length} records`;

  if (!s.filtered.length) {
    wrap.innerHTML = '<div class="comp-state">No records match your filters</div>';
    document.getElementById(`${type}-pagination`).innerHTML = '';
    return;
  }

  const total = s.filtered.length;
  const pages = Math.ceil(total / PAGE_SIZE);
  s.page = Math.min(s.page, pages);
  const start = (s.page - 1) * PAGE_SIZE;
  const rows = s.filtered.slice(start, start + PAGE_SIZE);

  const thead = cols.map(c => {
    const cls = s.sortCol === c.key ? (s.sortDir === 'asc' ? 'sort-asc' : 'sort-desc') : '';
    return `<th class="${cls}" data-key="${c.key}">${c.label}</th>`;
  }).join('');

  const tbody = rows.map(row =>
    `<tr>${cols.map(c => `<td>${c.render(row)}</td>`).join('')}</tr>`
  ).join('');

  wrap.innerHTML = `
    <div class="comp-table-wrap">
      <table class="comp-table">
        <thead><tr>${thead}</tr></thead>
        <tbody>${tbody}</tbody>
      </table>
    </div>`;

  wrap.querySelectorAll('thead th').forEach(th => {
    th.addEventListener('click', () => sortBy(type, th.dataset.key));
  });

  renderPagination(type, pages);
}

/* ── PAGINATION ── */
function renderPagination(type, pages) {
  const el = document.getElementById(`${type}-pagination`);
  if (!el) return;
  if (pages <= 1) { el.innerHTML = ''; return; }

  const s = state[type];
  const cur = s.page;
  let html = `<button class="page-btn" ${cur===1?'disabled':''} data-p="${cur-1}">‹ Prev</button>`;

  for (let i = 1; i <= pages; i++) {
    if (i===1 || i===pages || Math.abs(i-cur)<=2)
      html += `<button class="page-btn ${i===cur?'active':''}" data-p="${i}">${i}</button>`;
    else if (Math.abs(i-cur)===3)
      html += `<span class="page-info">…</span>`;
  }

  html += `<button class="page-btn" ${cur===pages?'disabled':''} data-p="${cur+1}">Next ›</button>`;
  html += `<span class="page-info">${(cur-1)*PAGE_SIZE+1}–${Math.min(cur*PAGE_SIZE, s.filtered.length)} of ${s.filtered.length}</span>`;

  el.innerHTML = html;
  el.querySelectorAll('[data-p]').forEach(btn => {
    btn.addEventListener('click', () => {
      state[type].page = parseInt(btn.dataset.p);
      renderTable(type);
      document.getElementById('comps').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

/* ── LOAD DATA ── */
async function loadAll() {
  ['lease','sale'].forEach(type => {
    const w = document.getElementById(`${type}-table-wrap`);
    if (w) w.innerHTML = '<div class="comp-state">Loading…</div>';
  });

  const results = await Promise.allSettled([fetchSheet('lease'), fetchSheet('sale')]);

  if (results[0].status === 'fulfilled' && results[0].value.length) {
    state.lease.raw = results[0].value;
    state.lease.filtered = [...state.lease.raw];
    console.log('Lease sample row:', state.lease.raw[0]);
    buildFilters(LEASE_FILTERS, state.lease.raw, 'lease');
    renderTable('lease');
  } else {
    const w = document.getElementById('lease-table-wrap');
    if (w) w.innerHTML = '<div class="comp-state error">Could not load lease comps — check sheet is published</div>';
    console.error('Lease error:', results[0].reason || 'No data');
  }

  if (results[1].status === 'fulfilled' && results[1].value.length) {
    state.sale.raw = results[1].value;
    state.sale.filtered = [...state.sale.raw];
    console.log('Sale sample row:', state.sale.raw[0]);
    buildFilters(SALE_FILTERS, state.sale.raw, 'sale');
    renderTable('sale');
  } else {
    const w = document.getElementById('sale-table-wrap');
    if (w) w.innerHTML = '<div class="comp-state error">Could not load sale comps — check sheet is published</div>';
    console.error('Sale error:', results[1].reason || 'No data');
  }
}

/* ── TABS ── */
function initTabs() {
  const tabLease  = document.getElementById('tab-lease');
  const tabSale   = document.getElementById('tab-sale');
  const paneLease = document.getElementById('pane-lease');
  const paneSale  = document.getElementById('pane-sale');

  function show(type) {
    state.activeTab = type;
    tabLease.classList.toggle('active', type === 'lease');
    tabSale.classList.toggle('active',  type === 'sale');
    paneLease.style.display = type === 'lease' ? '' : 'none';
    paneSale.style.display  = type === 'sale'  ? '' : 'none';
  }

  tabLease.addEventListener('click', () => show('lease'));
  tabSale.addEventListener('click',  () => show('sale'));
  show('lease');
}

/* ── NAV ── */
function initNav() {
  const links = document.querySelectorAll('.nav-links a[data-section]');
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting)
        links.forEach(a => a.classList.toggle('active', a.dataset.section === e.target.id));
    });
  }, { threshold: 0.25 });
  ['comps','about'].forEach(id => { const el = document.getElementById(id); if (el) obs.observe(el); });
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      const t = document.querySelector(a.getAttribute('href'));
      if (t) { e.preventDefault(); t.scrollIntoView({ behavior: 'smooth' }); }
    });
  });
}

/* ── BOOT ── */
document.addEventListener('DOMContentLoaded', () => { initTabs(); initNav(); loadAll(); });
