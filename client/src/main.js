import './styles.css';

/*  helpers  */
const $ = (s, ctx = document) => ctx.querySelector(s);
const $$ = (s, ctx = document) => [...ctx.querySelectorAll(s)];
const money = (v, cur) => new Intl.NumberFormat(undefined, { style: 'currency', currency: cur || state.user?.currency || 'USD' }).format(Number(v || 0));
const esc = s => String(s).replace(/</g, '&lt;').replace(/>/g, '&gt;');
const API = '/api';
const app = document.getElementById('app');

/*  state  */
const state = {
  token: localStorage.getItem('pm_token') || '',
  user: null, dashboard: null, categories: [],
  tab: 'overview', note: null, search: [],
  spending: null, budgets: [], alerts: [],
  notifications: [], trending: [], deals: [],
  monitors: [], festivals: [], monitorOrders: [],
  monitorDetail: null,
};

/*  api  */
async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const res = await fetch(`${API}${path}`, { ...opts, headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

/*  hydrate  */
async function hydrate() {
  const [me, dashboard, categories, spending, budgets, alerts, notifResp, trending, deals, monitors, festivals, monitorOrders] = await Promise.all([
    api('/auth/me'), api('/dashboard'), api('/categories'),
    api('/spending?period=month'), api('/budgets'), api('/alerts'),
    api('/notifications'), api('/prices/trending'), api('/prices/deals'),
    api('/monitors'), api('/festivals'), api('/monitor-orders'),
  ]);
  /* /notifications returns { notifications:[], unread:N } */
  const notifications = Array.isArray(notifResp) ? notifResp : (notifResp?.notifications || []);
  Object.assign(state, { user: me, dashboard, categories, spending, budgets, alerts, notifications, trending, deals, monitors, festivals, monitorOrders });
}

/*  bootstrap  */
async function bootstrap() {
  showSplash();
  if (!state.token) { hideSplash(); return renderAuth(); }
  try { await hydrate(); hideSplash(); renderApp(); }
  catch { hideSplash(); logout(); }
}

function showSplash() {
  app.innerHTML = `
    <div class="pm2-splash" id="pm2-splash">
      <svg width="64" height="64" viewBox="0 0 64 64">
        <defs>
          <linearGradient id="sg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#3b82f6"/>
            <stop offset="100%" stop-color="#06b6d4"/>
          </linearGradient>
        </defs>
        <rect rx="14" width="64" height="64" fill="#0f1829"/>
        <text x="32" y="44" text-anchor="middle" font-size="32"></text>
      </svg>
      <div class="pm2-splash-label">PriceMind</div>
      <div class="pm2-splash-bar"><div class="pm2-splash-fill"></div></div>
    </div>`;
}
function hideSplash() {
  const s = $('#pm2-splash');
  if (s) { s.style.opacity = '0'; s.style.transform = 'scale(1.06)'; setTimeout(() => s.remove(), 350); }
}

/*  logout  */
function logout() {
  localStorage.removeItem('pm_token');
  Object.assign(state, { token: '', user: null, notifications: [], dashboard: null });
  renderAuth();
}

/*  toast  */
function toast(msg, type = 'ok') {
  let rack = $('#pm2-toast-rack');
  if (!rack) { rack = document.createElement('div'); rack.id = 'pm2-toast-rack'; document.body.appendChild(rack); }
  const t = document.createElement('div');
  t.className = `pm2-toast pm2-toast-${type}`;
  const icon = type === 'ok' ? '' : type === 'xp' ? '' : '';
  t.innerHTML = `<span class="pm2-toast-icon">${icon}</span><span>${esc(msg)}</span>`;
  rack.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 3200);
}

/*  confetti  */
function confetti(x, y) {
  const colors = ['#3b82f6','#06b6d4','#8b5cf6','#10b981','#f59e0b','#ef4444','#fff'];
  for (let i = 0; i < 24; i++) {
    const p = document.createElement('div');
    p.className = 'pm2-confetti';
    p.style.cssText = `left:${x}px;top:${y}px;background:${colors[i % colors.length]};--dx:${(Math.random()-0.5)*180}px;--dy:${-(Math.random()*160+60)}px;--r:${Math.random()*720}deg;`;
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 1200);
  }
}

/*  badge  */
function badge(rating) {
  const map = { good: ['pm2-good', ' Good'], fair: ['pm2-fair', '~ Fair'], bad: ['pm2-bad', ' High'] };
  const [cls, label] = map[rating] || ['pm2-unknown', '? Unknown'];
  return `<span class="pm2-badge ${cls}">${label}</span>`;
}

/*  svgRing  */
function svgRing(pct, color, size = 56) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" class="pm2-ring-svg">
    <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="rgba(255,255,255,.07)" stroke-width="6"/>
    <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="${color}" stroke-width="6"
      stroke-dasharray="${dash} ${circ}" stroke-dashoffset="${circ/4}" stroke-linecap="round"
      style="transition:stroke-dasharray .8s cubic-bezier(.34,1.56,.64,1)"/>
  </svg>`;
}

/*  AUTH  */
function renderAuth(mode = 'login', msg = '') {
  app.innerHTML = `
    <section class="pm2-auth">
      <div class="pm2-orb pm2-orb-1"></div>
      <div class="pm2-orb pm2-orb-2"></div>
      <div class="pm2-orb pm2-orb-3"></div>
      <div class="pm2-auth-card">
        <div class="pm2-auth-logo">
          <span class="pm2-brain-icon"></span>
          <span class="pm2-auth-brand">PriceMind</span>
        </div>
        <p class="pm2-auth-tagline">Log prices  Analyze fairness  Track spending  Make smarter money decisions</p>

        <div class="pm2-auth-mode-wrap">
          <div class="pm2-auth-slider" style="transform:translateX(${mode === 'register' ? '100%' : '0'})"></div>
          <button class="pm2-auth-mode-btn ${mode === 'login' ? 'active' : ''}" data-auth="login">Login</button>
          <button class="pm2-auth-mode-btn ${mode === 'register' ? 'active' : ''}" data-auth="register">Register</button>
        </div>

        ${msg ? `<div class="pm2-msg pm2-msg-err"><span></span> ${esc(msg)}</div>` : ''}

        <form id="pm2-auth-form" class="pm2-auth-form" autocomplete="on">
          ${mode === 'register' ? `
            <div class="pm2-float-field">
              <input class="pm2-float-input" name="name" id="f-name" required placeholder=" "/>
              <label class="pm2-float-label" for="f-name">Full Name</label>
            </div>` : ''}
          <div class="pm2-float-field">
            <input class="pm2-float-input" type="email" name="email" id="f-email" required placeholder=" " />
            <label class="pm2-float-label" for="f-email">Email Address</label>
          </div>
          <div class="pm2-float-field">
            <input class="pm2-float-input" type="password" name="password" id="f-pw" required minlength="6" placeholder=" "/>
            <label class="pm2-float-label" for="f-pw">Password</label>
          </div>
          ${mode === 'register' ? `
            <div class="pm2-float-field">
              <select class="pm2-float-input pm2-select" name="currency" id="f-cur">
                <option value="USD">USD  US Dollar</option>
                <option value="EUR">EUR  Euro</option>
                <option value="INR">INR  Indian Rupee</option>
                <option value="GBP">GBP  British Pound</option>
              </select>
              <label class="pm2-float-label pm2-select-label" for="f-cur">Currency</label>
            </div>` : ''}
          <button class="pm2-auth-submit" type="submit" id="pm2-auth-btn">
            <span id="pm2-auth-btn-text">${mode === 'login' ? 'Sign In' : 'Create Account'}</span>
            <span id="pm2-auth-btn-spin" class="pm2-spin" style="display:none"></span>
          </button>
        </form>
      </div>
    </section>`;

  $$('.pm2-auth-mode-btn').forEach(btn => btn.addEventListener('click', () => renderAuth(btn.dataset.auth)));
  $('#pm2-auth-form').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = $('#pm2-auth-btn'); const btnTxt = $('#pm2-auth-btn-text'); const spin = $('#pm2-auth-btn-spin');
    btn.disabled = true; btnTxt.style.display = 'none'; spin.style.display = 'inline';
    const payload = Object.fromEntries(new FormData(e.target).entries());
    try {
      const route = mode === 'login' ? '/auth/login' : '/auth/register';
      const data = await api(route, { method: 'POST', body: payload });
      state.token = data.token;
      localStorage.setItem('pm_token', data.token);
      showSplash();
      await hydrate();
      hideSplash();
      renderApp();
    } catch (err) {
      btn.disabled = false; btnTxt.style.display = ''; spin.style.display = 'none';
      renderAuth(mode, err.message);
    }
  });
}

/*  APP SHELL  */
const NAV_ITEMS = [
  { id: 'overview',   icon: '', label: 'Overview' },
  { id: 'monitor',    icon: '📡', label: 'Monitor' },
  { id: 'log-price',  icon: '＋', label: 'Log Price' },
  { id: 'search',     icon: '', label: 'Search' },
  { id: 'spending',   icon: '', label: 'Spending' },
  { id: 'tools',      icon: '', label: 'Tools' },
];

function renderApp() {
  const d = state.dashboard || {};
  const u = state.user || {};
  const xpPct = Math.min(100, ((u.xp || 0) % 100));
  const unread = state.notifications.filter(n => !n.is_read).length;

  app.innerHTML = `
    <div class="pm2-shell">
      <!-- sidebar -->
      <aside class="pm2-sidebar" id="pm2-sidebar">
        <div class="pm2-sidebar-logo">
          <span class="pm2-brain-sm"></span>
          <span class="pm2-sidebar-brand">PriceMind</span>
        </div>
        <nav class="pm2-nav">
          ${NAV_ITEMS.map(n => `
            <button class="pm2-nav-btn ${state.tab === n.id ? 'active' : ''}" data-tab="${n.id}" style="--tc:var(--pm2-blue)">
              <span class="pm2-nav-icon">${n.icon}</span>
              <span class="pm2-nav-label">${n.label}</span>
            </button>`).join('')}
        </nav>
        <div class="pm2-sidebar-user">
          <div class="pm2-user-avatar" style="background:${u.avatar_color || '#3b82f6'}">
            ${u.avatar_emoji || u.name?.[0]?.toUpperCase() || '?'}
          </div>
          <div class="pm2-user-info">
            <div class="pm2-user-name">${esc(u.name || '')}</div>
            <div class="pm2-user-level">Lv ${u.level || 1}  ${u.xp || 0} XP</div>
          </div>
        </div>
        <div class="pm2-xp-bar-wrap">
          <div class="pm2-xp-bar"><div class="pm2-xp-fill" style="width:${xpPct}%"></div></div>
          <div class="pm2-xp-label">${xpPct}/100 XP to next level</div>
        </div>
        <button class="pm2-logout-btn" id="pm2-logout">  Sign out</button>
      </aside>

      <!-- main -->
      <main class="pm2-main">
        <!-- topbar -->
        <header class="pm2-topbar">
          <button class="pm2-menu-toggle" id="pm2-menu-toggle"></button>
          <div class="pm2-topbar-pills">
            <span class="pm2-pill pm2-pill-streak"> ${u.streak || 0} day streak</span>
            <span class="pm2-pill pm2-pill-health"> Health ${d.financial_health_score || 0}/100</span>
            ${unread ? `<span class="pm2-pill pm2-pill-notif"> ${unread}</span>` : ''}
          </div>
          <button class="pm2-icon-btn" id="pm2-refresh" title="Refresh"></button>
        </header>

        <!-- kpi strip -->
        <div class="pm2-kpis" id="pm2-kpis">
          ${kpiCard('Contributions', d.total_contributions ?? 0, '#3b82f6', Math.min(100, (d.total_contributions || 0) * 2))}
          ${kpiCard('Monthly Spend', money(d.monthly_spend), '#8b5cf6', 60)}
          ${kpiCard('Active Alerts', d.active_alerts ?? 0, '#f59e0b', Math.min(100, (d.active_alerts || 0) * 10))}
          ${kpiCard('Financial Health', `${d.financial_health_score || 0}/100`, d.financial_health_score >= 70 ? '#10b981' : d.financial_health_score >= 40 ? '#f59e0b' : '#ef4444', d.financial_health_score || 0)}
        </div>

        <!-- notification banner -->
        ${state.note ? `<div class="pm2-banner pm2-banner-${state.note.type}" id="pm2-banner">
          <span>${state.note.type === 'ok' ? '' : ''}</span>
          <span>${esc(state.note.message)}</span>
          <button class="pm2-banner-x" id="pm2-banner-close"></button>
        </div>` : ''}

        <!-- content -->
        <div class="pm2-content" id="pm2-content">
          ${renderTab()}
        </div>
      </main>
    </div>
  `;

  /* event bindings */
  $('#pm2-logout').addEventListener('click', logout);
  $('#pm2-refresh').addEventListener('click', async () => {
    const ico = $('#pm2-refresh');
    ico.style.animation = 'pm2-spin-anim 0.6s linear';
    try { await hydrate(); renderApp(); toast('Data refreshed', 'ok'); }
    catch(e) { toast(e.message, 'err'); }
    finally { if (ico) ico.style.animation = ''; }
  });
  const menuToggle = $('#pm2-menu-toggle');
  if (menuToggle) menuToggle.addEventListener('click', () => {
    $('#pm2-sidebar')?.classList.toggle('open');
  });
  $$('.pm2-nav-btn').forEach(btn => btn.addEventListener('click', () => {
    state.tab = btn.dataset.tab;
    state.note = null;
    renderApp();
  }));
  const bannerClose = $('#pm2-banner-close');
  if (bannerClose) bannerClose.addEventListener('click', () => { state.note = null; $('#pm2-banner')?.remove(); });

  /* animate kpis */
  setTimeout(() => $$('.pm2-kpi').forEach((c, i) => {
    c.style.animationDelay = `${i * 0.07}s`;
    c.classList.add('pm2-kpi-in');
  }), 30);

  bindTabActions();
}

function kpiCard(label, value, color, pct) {
  return `<article class="pm2-kpi" style="--kc:${color}">
    <div class="pm2-kpi-body">
      <div class="pm2-kpi-label">${label}</div>
      <div class="pm2-kpi-value">${value}</div>
    </div>
    ${svgRing(pct, color, 52)}
  </article>`;
}

/*  TABS  */
function renderTab() {
  switch (state.tab) {
    case 'monitor':    return renderMonitor();
    case 'log-price':  return renderLogPrice();
    case 'search':     return renderSearch();
    case 'spending':   return renderSpending();
    case 'tools':      return renderTools();
    default:           return renderOverview();
  }
}

/*  sparkline  */
function sparkline(prices, width = 130, height = 44) {
  if (!prices || prices.length < 2) return `<div class="pm2-spark-empty">No data</div>`;
  const min = Math.min(...prices); const max = Math.max(...prices);
  const range = max - min || 1;
  const pts = prices.map((p, i) => { const x = (i / (prices.length - 1)) * width; const y = height - ((p - min) / range) * (height - 4) - 2; return `${x.toFixed(1)},${y.toFixed(1)}`; }).join(' ');
  const last = prices[prices.length - 1]; const first = prices[0];
  const color = last < first ? '#10b981' : last > first ? '#ef4444' : '#3b82f6';
  const lx = width; const ly = height - ((last - min) / range) * (height - 4) - 2;
  // Filled area path
  const firstPt = `0,${(height - ((first - min) / range) * (height - 4) - 2).toFixed(1)}`;
  const areaPath = `M ${firstPt} L ${pts.split(' ').join(' L ')} L ${width},${height} L 0,${height} Z`;
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" class="pm2-sparkline-svg">
    <defs><linearGradient id="sg-${Math.random().toString(36).slice(2)}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${color}" stop-opacity="0.25"/><stop offset="100%" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
    <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="3.5" fill="${color}" stroke="white" stroke-width="1"/>
  </svg>`;
}

/*  overview  */
function renderOverview() {
  const d = state.dashboard || {};
  // Upcoming festivals (next 30 days)
  const upcoming = (state.festivals || []).filter(f => f.days_until >= 0 && f.days_until <= 60).slice(0, 8);
  const festivalsHtml = upcoming.length ? `
    <div class="pm2-section-heading" style="margin-bottom:8px">🗓️ Upcoming Offers & Festivals</div>
    <div class="pm2-festival-strip">
      ${upcoming.map(f => `
        <div class="pm2-festival-card" style="--fc:${f.color || '#3b82f6'}">
          <div class="pm2-festival-icon">${f.icon}</div>
          <div class="pm2-festival-name">${esc(f.name)}</div>
          <div class="pm2-festival-days">${f.is_today ? 'TODAY!' : f.days_until + ' days'}</div>
          <div class="pm2-festival-discount">Up to ${f.typical_discount_pct}% off</div>
          <div class="pm2-festival-cats">${(f.categories || []).slice(0,2).map(c => `<span class="pm2-festival-tag">${c}</span>`).join('')}</div>
          <div class="pm2-festival-advice">${esc(f.advice)}</div>
        </div>`).join('')}
    </div>` : '';

  return `
    ${festivalsHtml}
    <div class="pm2-two-col">
      <div class="pm2-col">
        <div class="pm2-section-heading">Daily Tip</div>
        <div class="pm2-tip-card"> ${esc(d.daily_tip?.tip || 'Track first, optimize second.')}</div>

        <div class="pm2-section-heading" style="margin-top:20px"> Triggered Alerts</div>
        <div class="pm2-item-list">
          ${(d.triggered_alerts || []).slice(0, 6).map(a => `
            <div class="pm2-item">
              <span class="pm2-item-icon"></span>
              <div class="pm2-item-body">
                <div class="pm2-item-title">${esc(a.product_name || 'Product')}</div>
                <div class="pm2-item-sub">Hit target ${money(a.target_price)}</div>
              </div>
            </div>`).join('') || '<div class="pm2-empty">No triggered alerts.</div>'}
        </div>

        <div class="pm2-section-heading" style="margin-top:20px">Notifications</div>
        <div class="pm2-item-list">
          ${state.notifications.slice(0, 6).map(n => `
            <div class="pm2-item ${n.is_read ? '' : 'pm2-item-unread'}">
              <span class="pm2-item-icon">${n.icon || ''}</span>
              <div class="pm2-item-body">
                <div class="pm2-item-title">${esc(n.title)}</div>
                <div class="pm2-item-sub">${esc(n.message || '')}</div>
              </div>
            </div>`).join('') || '<div class="pm2-empty">No notifications.</div>'}
        </div>
      </div>

      <div class="pm2-col">
        <div class="pm2-section-heading"> Trending Products</div>
        <div class="pm2-item-list">
          ${state.trending.slice(0, 8).map((t, i) => `
            <div class="pm2-item stagger-${Math.min(i+1,8)}">
              <span class="pm2-item-icon">${t.icon || ''}</span>
              <div class="pm2-item-body">
                <div class="pm2-item-title">${esc(t.name)}</div>
                <div class="pm2-item-sub">${t.entry_count} entries  avg ${money(t.avg_price)}</div>
              </div>
              <span class="pm2-price-tag">${money(t.latest_price)}</span>
            </div>`).join('') || '<div class="pm2-empty">No trend data yet.</div>'}
        </div>

        <div class="pm2-section-heading" style="margin-top:20px"> Best Deals</div>
        <div class="pm2-item-list">
          ${state.deals.slice(0, 6).map((d, i) => `
            <div class="pm2-item stagger-${Math.min(i+1,6)}">
              <span class="pm2-item-icon">${d.icon || ''}</span>
              <div class="pm2-item-body">
                <div class="pm2-item-title">${esc(d.product_name)}</div>
                <div class="pm2-item-sub">${esc(d.store_name || 'Store')}  score ${d.ai_score}</div>
              </div>
              <div>${badge(d.ai_rating)}</div>
            </div>`).join('') || '<div class="pm2-empty">No deals yet.</div>'}
        </div>
      </div>
    </div>`;
}

/*  monitor  */
function renderMonitor() {
  const monitors = state.monitors || [];
  const orders = state.monitorOrders || [];
  const pendingOrders = orders.filter(o => o.status === 'pending');
  const cur = state.user?.currency || 'INR';

  const monitorCards = monitors.length ? monitors.map((m, i) => {
    const prices = (m.history || []).map(h => h.price);
    const last30 = prices.slice(-30);
    const changePct = parseFloat(m.price_change_pct || 0);
    const changeClass = changePct < 0 ? 'pm2-change-down' : changePct > 0 ? 'pm2-change-up' : '';
    const changeIcon = changePct < 0 ? '↓' : changePct > 0 ? '↑' : '→';
    const savingsVsHigh = m.highest_price > m.latest_price ? ((m.highest_price - m.latest_price) / m.highest_price * 100).toFixed(0) : '0';
    return `
    <div class="pm2-monitor-card stagger-${Math.min(i+1,8)}" data-monitor-id="${m.id}">
      <div class="pm2-monitor-head">
        <div class="pm2-monitor-name-wrap">
          <div class="pm2-monitor-name">${esc(m.product_name)}</div>
          <div class="pm2-monitor-cat">📂 ${esc(m.category || 'General')}</div>
        </div>
        <div class="pm2-monitor-actions-top">
          <button class="pm2-icon-action pm2-icon-action-check" data-check-monitor="${m.id}" title="Check Price Now">🔄</button>
          <button class="pm2-icon-action pm2-icon-action-del" data-delete-monitor="${m.id}" title="Remove Monitor">🗑️</button>
        </div>
      </div>
      <div class="pm2-monitor-spark">${sparkline(last30, 160, 48)}</div>
      <div class="pm2-monitor-prices">
        <div class="pm2-mprice-cell">
          <div class="pm2-mprice-label">Current</div>
          <div class="pm2-mprice-val">${money(m.latest_price, cur)}</div>
          <div class="pm2-mprice-change ${changeClass}">${changeIcon} ${Math.abs(changePct)}%</div>
        </div>
        <div class="pm2-mprice-cell">
          <div class="pm2-mprice-label">All-Time Low 🏆</div>
          <div class="pm2-mprice-val pm2-price-low">${money(m.lowest_price, cur)}</div>
          ${m.is_at_all_time_low ? '<div class="pm2-badge-atl">AT LOW NOW!</div>' : ''}
        </div>
        <div class="pm2-mprice-cell">
          <div class="pm2-mprice-label">Avg / High</div>
          <div class="pm2-mprice-val">${money(m.avg_price, cur)}</div>
          <div class="pm2-mprice-sub">${money(m.highest_price, cur)} high</div>
        </div>
      </div>
      ${parseFloat(savingsVsHigh) > 0 ? `<div class="pm2-savings-tag">💰 ${savingsVsHigh}% below all-time high — good time to buy!</div>` : ''}
      <div class="pm2-monitor-settings">
        <div class="pm2-autoorder-row">
          <span class="pm2-autoorder-label">Auto-Order ${m.auto_order ? '<span class="pm2-badge-on">ON</span>' : '<span class="pm2-badge-off">OFF</span>'}</span>
          <button class="pm2-toggle-btn ${m.auto_order ? 'pm2-toggle-on' : ''}" data-toggle-autoorder="${m.id}" data-current="${m.auto_order}">
            ${m.auto_order ? '✅ Auto-Order Enabled' : '☐ Enable Auto-Order'}
          </button>
        </div>
        <div class="pm2-target-row">
          <span class="pm2-target-label">Target: <strong>${money(m.target_price, cur)}</strong></span>
          <span class="pm2-qty-label">Qty: <strong>${m.order_quantity || 1}</strong></span>
        </div>
        <div class="pm2-monitor-footer">
          <span class="pm2-last-checked">Last check: ${m.last_checked ? new Date(m.last_checked).toLocaleDateString() : 'Never'}</span>
          <span class="pm2-data-pts">${m.price_count} data pts</span>
        </div>
      </div>
    </div>`;
  }).join('') : `<div class="pm2-empty pm2-empty-lg">No products monitored yet. Add one above!</div>`;

  const ordersHtml = orders.length ? orders.slice(0, 10).map(o => {
    const statusClass = o.status === 'pending' ? 'pm2-order-pending' : o.status === 'confirmed' ? 'pm2-order-confirmed' : 'pm2-order-cancelled';
    const statusIcon = o.status === 'pending' ? '⏳' : o.status === 'confirmed' ? '✅' : '❌';
    return `
    <div class="pm2-order-card ${statusClass}">
      <div class="pm2-order-head">
        <div class="pm2-order-product">${statusIcon} ${esc(o.product_name)}</div>
        <div class="pm2-order-status">${o.status.toUpperCase()}</div>
      </div>
      <div class="pm2-order-details">
        <span>Price: <strong>${money(o.triggered_price, cur)}</strong></span>
        <span>Qty: <strong>${o.quantity}</strong></span>
        <span>Reason: ${o.trigger_reason === 'all_time_low' ? '🏆 All-time Low' : '🎯 Target Hit'}</span>
        <span>${new Date(o.ordered_at).toLocaleDateString()}</span>
      </div>
      ${o.status === 'pending' ? `
      <div class="pm2-order-btns">
        <button class="pm2-btn-confirm" data-confirm-order="${o.id}">✅ Confirm Order</button>
        <button class="pm2-btn-cancel-order" data-cancel-order="${o.id}">❌ Cancel</button>
      </div>` : ''}
    </div>`;
  }).join('') : '<div class="pm2-empty">No auto-orders yet.</div>';

  // Festival advice for monitored products
  const festivalTips = (state.festivals || []).filter(f => f.days_until >= 0 && f.days_until <= 30).slice(0, 3);

  return `
    <div class="pm2-monitor-page">
      <!-- Add Monitor Form -->
      <div class="pm2-section-heading">📡 Add Product to Monitor</div>
      <div class="pm2-card pm2-monitor-form-card">
        <form id="pm2-monitor-form" class="pm2-form">
          <div class="pm2-form-grid pm2-monitor-grid-3">
            <div class="pm2-float-field">
              <input class="pm2-float-input" name="product_name" id="mn-prod" required autocomplete="off" placeholder=" "/>
              <label class="pm2-float-label" for="mn-prod">Product Name (e.g. Rice, iPhone, Petrol)</label>
            </div>
            <div class="pm2-float-field">
              <input class="pm2-float-input" name="base_price" id="mn-base" type="number" min="0.01" step="0.01" required placeholder=" "/>
              <label class="pm2-float-label" for="mn-base">Current / Base Price</label>
            </div>
            <div class="pm2-float-field">
              <input class="pm2-float-input" name="target_price" id="mn-target" type="number" min="0.01" step="0.01" placeholder=" "/>
              <label class="pm2-float-label" for="mn-target">Target Price (blank = 10% below)</label>
            </div>
            <div class="pm2-float-field">
              <input class="pm2-float-input" name="order_quantity" id="mn-qty" type="number" min="1" value="1" placeholder=" "/>
              <label class="pm2-float-label pm2-select-label" for="mn-qty">Auto-Order Quantity</label>
            </div>
            <div class="pm2-float-field">
              <select class="pm2-float-input pm2-select" name="currency" id="mn-cur">
                <option value="INR" ${cur==='INR'?'selected':''}>INR ₹</option>
                <option value="USD" ${cur==='USD'?'selected':''}>USD $</option>
                <option value="EUR">EUR €</option>
                <option value="GBP">GBP £</option>
              </select>
              <label class="pm2-float-label pm2-select-label" for="mn-cur">Currency</label>
            </div>
            <div class="pm2-float-field pm2-autoorder-field">
              <label class="pm2-checkbox-label">
                <input type="checkbox" name="auto_order" id="mn-auto" class="pm2-checkbox"/>
                <span>Enable Auto-Order when price hits target or all-time low</span>
              </label>
            </div>
          </div>
          <button class="pm2-submit-btn" type="submit" id="pm2-monitor-btn">
            <span id="pm2-monitor-btn-txt">📡 Start Monitoring</span>
            <span class="pm2-spin" id="pm2-monitor-spin" style="display:none"></span>
          </button>
        </form>
      </div>

      ${festivalTips.length ? `
      <div class="pm2-festival-alert-strip">
        ${festivalTips.map(f => `
          <div class="pm2-festival-alert" style="border-left-color:${f.color || '#f59e0b'}">
            <span>${f.icon}</span>
            <div>
              <strong>${esc(f.name)}</strong> in ${f.days_until} days —
              Up to ${f.typical_discount_pct}% off on ${(f.categories||[]).join(', ')}.
              <em>${esc(f.advice)}</em>
            </div>
          </div>`).join('')}
      </div>` : ''}

      <!-- Monitored Products -->
      <div class="pm2-section-heading" style="margin-top:24px">
        📊 Monitored Products
        <span class="pm2-monitor-count">${monitors.length} product${monitors.length !== 1 ? 's' : ''}</span>
      </div>
      <div class="pm2-monitor-cards">${monitorCards}</div>

      <!-- Pending Orders -->
      ${pendingOrders.length ? `
      <div class="pm2-section-heading pm2-orders-heading" style="margin-top:28px">
        🛒 Pending Auto-Orders <span class="pm2-badge-count">${pendingOrders.length}</span>
      </div>` : `<div class="pm2-section-heading" style="margin-top:28px">🛒 Auto-Order History</div>`}
      <div class="pm2-orders-list">${ordersHtml}</div>
    </div>`;
}

/*  log price  */
function renderLogPrice() {
  const recent = state.dashboard?.recent_prices || [];
  return `
    <div class="pm2-two-col">
      <div class="pm2-col">
        <div class="pm2-section-heading">Log a New Price</div>
        <div class="pm2-card">
          <form id="pm2-price-form" class="pm2-form">
            <div class="pm2-form-grid">
              <div class="pm2-float-field"><input class="pm2-float-input" name="product_name" id="pf-prod" required placeholder=" "/><label class="pm2-float-label" for="pf-prod">Product Name</label></div>
              <div class="pm2-float-field"><input class="pm2-float-input" name="price" id="pf-price" type="number" min="0" step="0.01" required placeholder=" "/><label class="pm2-float-label" for="pf-price">Price</label></div>
              <div class="pm2-float-field"><input class="pm2-float-input" name="store_name" id="pf-store" placeholder=" "/><label class="pm2-float-label" for="pf-store">Store Name</label></div>
              <div class="pm2-float-field"><input class="pm2-float-input" name="city" id="pf-city" placeholder=" "/><label class="pm2-float-label" for="pf-city">City</label></div>
              <div class="pm2-float-field"><input class="pm2-float-input" name="quantity" id="pf-qty" type="number" min="1" value="1" placeholder=" "/><label class="pm2-float-label" for="pf-qty">Quantity</label></div>
              <div class="pm2-float-field">
                <select class="pm2-float-input pm2-select" name="currency" id="pf-cur">
                  <option>${state.user?.currency || 'USD'}</option><option>USD</option><option>EUR</option><option>INR</option><option>GBP</option>
                </select>
                <label class="pm2-float-label pm2-select-label" for="pf-cur">Currency</label>
              </div>
            </div>
            <div class="pm2-float-field"><textarea class="pm2-float-input pm2-textarea" name="notes" id="pf-notes" rows="3" placeholder=" "></textarea><label class="pm2-float-label" for="pf-notes">Notes</label></div>
            <button class="pm2-submit-btn" type="submit" id="pm2-price-btn">
              <span id="pm2-price-btn-txt"> Save Price + Analyze</span>
              <span class="pm2-spin" id="pm2-price-spin" style="display:none"></span>
            </button>
          </form>
        </div>
      </div>
      <div class="pm2-col">
        <div class="pm2-section-heading">Recent Personal Entries</div>
        <div class="pm2-item-list">
          ${recent.map((p, i) => `
            <div class="pm2-item stagger-${Math.min(i+1,8)}">
              <span class="pm2-item-icon">${p.icon || ''}</span>
              <div class="pm2-item-body">
                <div class="pm2-item-title">${esc(p.product_name)}</div>
                <div class="pm2-item-sub">${money(p.price, p.currency)}  ${esc(p.store_name || 'Unknown')}  score ${p.ai_score ?? '-'}</div>
              </div>
              ${badge(p.ai_rating)}
            </div>`).join('') || '<div class="pm2-empty">No entries yet.</div>'}
        </div>
      </div>
    </div>`;
}

/*  search  */
function renderSearch() {
  return `
    <div class="pm2-card" style="margin-bottom:16px">
      <form id="pm2-search-form" class="pm2-form">
        <div class="pm2-form-grid">
          <div class="pm2-float-field"><input class="pm2-float-input" name="q" id="sq-q" placeholder=" "/><label class="pm2-float-label" for="sq-q">Search product or store</label></div>
          <div class="pm2-float-field"><input class="pm2-float-input" name="city" id="sq-city" placeholder=" "/><label class="pm2-float-label" for="sq-city">City (optional)</label></div>
          <div class="pm2-float-field">
            <select class="pm2-float-input pm2-select" name="sort" id="sq-sort">
              <option value="">Newest</option><option value="price_asc">Lowest Price</option><option value="price_desc">Highest Price</option><option value="entries">Most Entries</option><option value="score">Best Score</option>
            </select>
            <label class="pm2-float-label pm2-select-label" for="sq-sort">Sort By</label>
          </div>
          <button class="pm2-submit-btn" type="submit" style="align-self:flex-end"> Find Prices</button>
        </div>
      </form>
    </div>
    <div class="pm2-search-grid" id="pm2-search-results">
      ${state.search.length ? state.search.map((item, i) => `
        <article class="pm2-result-card stagger-${Math.min(i+1,8)}">
          <div class="pm2-result-head">
            <span class="pm2-result-icon">${item.category_icon || ''}</span>
            <div>
              <div class="pm2-result-name">${esc(item.product_name)}</div>
              <div class="pm2-result-sub">${item.total_entries} entries</div>
            </div>
            ${badge(item.ai_rating)}
          </div>
          <div class="pm2-result-prices">
            <div class="pm2-result-price-row"><span>Best</span><strong>${money(item.min_price)}</strong></div>
            <div class="pm2-result-price-row"><span>Avg</span><strong>${money(item.avg_price)}</strong></div>
            <div class="pm2-result-price-row"><span>Latest</span><strong>${money(item.price)} @ ${esc(item.store_name || 'Unknown')}</strong></div>
          </div>
          <div class="pm2-result-actions">
            <button class="pm2-action-btn" data-watch="${item.product_id}">+ Watchlist</button>
            <button class="pm2-action-btn pm2-action-btn-alt" data-predict="${item.product_id}"> Predict</button>
          </div>
        </article>`).join('') : '<div class="pm2-empty pm2-empty-lg">Enter a search query above to find prices.</div>'}
    </div>`;
}

/*  spending  */
function renderSpending() {
  const sp = state.spending || {};
  return `
    <div class="pm2-two-col">
      <div class="pm2-col">
        <div class="pm2-section-heading">Add Spending Entry</div>
        <div class="pm2-card">
          <form id="pm2-spending-form" class="pm2-form">
            <div class="pm2-form-grid">
              <div class="pm2-float-field"><input class="pm2-float-input" name="category" id="sp-cat" required placeholder=" "/><label class="pm2-float-label" for="sp-cat">Category</label></div>
              <div class="pm2-float-field"><input class="pm2-float-input" name="amount" id="sp-amt" type="number" step="0.01" min="0" required placeholder=" "/><label class="pm2-float-label" for="sp-amt">Amount</label></div>
              <div class="pm2-float-field"><input class="pm2-float-input" name="date" id="sp-date" type="date" placeholder=" "/><label class="pm2-float-label pm2-select-label" for="sp-date">Date</label></div>
              <div class="pm2-float-field"><input class="pm2-float-input" name="payment_method" id="sp-pay" placeholder=" "/><label class="pm2-float-label" for="sp-pay">Payment Method</label></div>
            </div>
            <div class="pm2-float-field"><input class="pm2-float-input" name="description" id="sp-desc" placeholder=" "/><label class="pm2-float-label" for="sp-desc">Description</label></div>
            <button class="pm2-submit-btn" type="submit"> Track Expense</button>
          </form>
        </div>

        <div class="pm2-section-heading" style="margin-top:20px">Create Budget</div>
        <div class="pm2-card">
          <form id="pm2-budget-form" class="pm2-form">
            <div class="pm2-form-grid">
              <div class="pm2-float-field"><input class="pm2-float-input" name="category" id="bud-cat" required placeholder=" "/><label class="pm2-float-label" for="bud-cat">Category</label></div>
              <div class="pm2-float-field"><input class="pm2-float-input" name="amount" id="bud-amt" type="number" step="0.01" min="0" required placeholder=" "/><label class="pm2-float-label" for="bud-amt">Monthly Budget</label></div>
            </div>
            <button class="pm2-submit-btn pm2-submit-btn-sec" type="submit">+ Add Budget</button>
          </form>
        </div>
      </div>

      <div class="pm2-col">
        <div class="pm2-section-heading">Monthly Snapshot</div>
        <div class="pm2-snapshot-card">
          <div class="pm2-snapshot-row">
            <span>Total Spend</span><strong>${money(sp.total || 0)}</strong>
          </div>
          <div class="pm2-snapshot-row">
            <span>Daily Avg</span><strong>${money(sp.avg_daily || 0)}</strong>
          </div>
        </div>
        <div class="pm2-section-heading" style="margin-top:20px">Budget Tracker</div>
        <div class="pm2-item-list">
          ${state.budgets.map(b => {
            const pct = Math.min(100, b.pct_used || 0);
            const color = pct > 90 ? '#ef4444' : pct > 70 ? '#f59e0b' : '#10b981';
            return `<div class="pm2-budget-row">
              <div class="pm2-budget-head"><span>${esc(b.category)}</span><span>${money(b.spent)} / ${money(b.amount)}</span></div>
              <div class="pm2-budget-bar-bg"><div class="pm2-budget-bar-fill" style="width:${pct}%;background:${color}"></div></div>
              <div class="pm2-budget-pct" style="color:${color}">${pct}% used</div>
            </div>`;
          }).join('') || '<div class="pm2-empty">No budgets yet.</div>'}
        </div>
      </div>
    </div>`;
}

/*  tools  */
function renderTools() {
  return `
    <div class="pm2-two-col">
      <div class="pm2-col">
        <div class="pm2-section-heading">Service Quote Checker</div>
        <div class="pm2-card">
          <form id="pm2-quote-form" class="pm2-form">
            <div class="pm2-form-grid">
              <div class="pm2-float-field"><input class="pm2-float-input" name="service_type" id="qt-svc" required placeholder=" "/><label class="pm2-float-label" for="qt-svc">Service Type</label></div>
              <div class="pm2-float-field"><input class="pm2-float-input" name="quoted_price" id="qt-price" type="number" step="0.01" min="0" required placeholder=" "/><label class="pm2-float-label" for="qt-price">Quoted Price</label></div>
              <div class="pm2-float-field"><input class="pm2-float-input" name="city" id="qt-city" placeholder=" "/><label class="pm2-float-label" for="qt-city">City</label></div>
              <div class="pm2-float-field"><input class="pm2-float-input" name="provider_name" id="qt-prov" placeholder=" "/><label class="pm2-float-label" for="qt-prov">Provider</label></div>
            </div>
            <div class="pm2-float-field"><textarea class="pm2-float-input pm2-textarea" name="description" id="qt-desc" rows="3" placeholder=" "></textarea><label class="pm2-float-label" for="qt-desc">Description</label></div>
            <button class="pm2-submit-btn" type="submit"> Analyze Quote</button>
          </form>
          <div id="pm2-quote-out" class="pm2-analysis-out"></div>
        </div>
      </div>

      <div class="pm2-col">
        <div class="pm2-section-heading">Discount Calculator</div>
        <div class="pm2-card">
          <form id="pm2-discount-form" class="pm2-form">
            <div class="pm2-float-field"><input class="pm2-float-input" name="original_price" id="dc-orig" type="number" min="0" step="0.01" required placeholder=" "/><label class="pm2-float-label" for="dc-orig">Original Price</label></div>
            <div class="pm2-float-field"><input class="pm2-float-input" name="discount_percent" id="dc-disc" type="number" min="0" max="100" value="10" placeholder=" "/><label class="pm2-float-label pm2-select-label" for="dc-disc">Discount %</label></div>
            <div class="pm2-float-field"><input class="pm2-float-input" name="tax_percent" id="dc-tax" type="number" min="0" max="100" value="0" placeholder=" "/><label class="pm2-float-label pm2-select-label" for="dc-tax">Tax %</label></div>
            <button class="pm2-submit-btn pm2-submit-btn-sec" type="submit">= Calculate</button>
          </form>
          <div id="pm2-discount-out" class="pm2-analysis-out"></div>
        </div>
      </div>
    </div>`;
}

/*  ACTIONS  */
async function bindTabActions() {
  /* price form */
  const priceForm = $('#pm2-price-form');
  if (priceForm) priceForm.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = $('#pm2-price-btn'); const txt = $('#pm2-price-btn-txt'); const spin = $('#pm2-price-spin');
    btn.disabled = true; txt.style.display = 'none'; spin.style.display = 'inline';
    try {
      const payload = Object.fromEntries(new FormData(e.target).entries());
      payload.price = Number(payload.price); payload.quantity = Number(payload.quantity || 1);
      const out = await api('/prices', { method: 'POST', body: payload });
      await hydrate();
      const rect = btn.getBoundingClientRect();
      confetti(rect.left + rect.width / 2, rect.top);
      toast(`Saved! AI rating: ${out.analysis.rating} (score ${out.analysis.score})`, 'xp');
      state.note = null;
      renderApp();
    } catch(err) { toast(err.message, 'err'); btn.disabled = false; txt.style.display = ''; spin.style.display = 'none'; }
  });

  /* search form */
  const searchForm = $('#pm2-search-form');
  if (searchForm) searchForm.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.textContent = ' Searching'; btn.disabled = true;
    try {
      const q = new URLSearchParams(Object.fromEntries(new FormData(e.target).entries())).toString();
      state.search = await api(`/prices/search?${q}`);
      renderApp();
    } catch(err) { toast(err.message, 'err'); }
    finally { if (btn) { btn.textContent = ' Find Prices'; btn.disabled = false; } }
  });

  /* watchlist */
  $$('[data-watch]').forEach(btn => btn.addEventListener('click', async () => {
    try { await api('/watchlist', { method: 'POST', body: { product_id: Number(btn.dataset.watch) } }); toast('Added to watchlist!', 'ok'); }
    catch(err) { toast(err.message, 'err'); }
  }));

  /* predict */
  $$('[data-predict]').forEach(btn => btn.addEventListener('click', async () => {
    btn.textContent = ''; btn.disabled = true;
    try {
      const p = await api(`/prices/predict/${btn.dataset.predict}`);
      toast(`${p.trend || 'stable'} trend  ~${money(p.predicted_price || p.expected_price || 0)}`, 'xp');
    } catch(err) { toast(err.message, 'err'); }
    finally { btn.textContent = ' Predict'; btn.disabled = false; }
  }));

  /* spending form */
  const spendForm = $('#pm2-spending-form');
  if (spendForm) spendForm.addEventListener('submit', async e => {
    e.preventDefault();
    try {
      const payload = Object.fromEntries(new FormData(e.target).entries());
      payload.amount = Number(payload.amount);
      await api('/spending', { method: 'POST', body: payload });
      await hydrate(); toast('Spending entry added', 'ok'); renderApp();
    } catch(err) { toast(err.message, 'err'); }
  });

  /* budget form */
  const budgetForm = $('#pm2-budget-form');
  if (budgetForm) budgetForm.addEventListener('submit', async e => {
    e.preventDefault();
    try {
      const payload = Object.fromEntries(new FormData(e.target).entries());
      payload.amount = Number(payload.amount);
      await api('/budgets', { method: 'POST', body: payload });
      await hydrate(); toast('Budget created', 'ok'); renderApp();
    } catch(err) { toast(err.message, 'err'); }
  });

  /* quote form */
  const quoteForm = $('#pm2-quote-form');
  if (quoteForm) quoteForm.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = e.target.querySelector('button'); btn.textContent = ' Analyzing'; btn.disabled = true;
    try {
      const payload = Object.fromEntries(new FormData(e.target).entries());
      payload.quoted_price = Number(payload.quoted_price);
      const out = await api('/services/quote', { method: 'POST', body: payload });
      const el = $('#pm2-quote-out');
      if (el) el.innerHTML = `<div class="pm2-analysis-result">
        <div class="pm2-analysis-score">Fairness Score: <strong>${out.analysis.fairness_score}</strong></div>
        <p>${esc(out.analysis.summary || out.analysis.verdict || 'Analysis completed.')}</p>
      </div>`;
    } catch(err) { toast(err.message, 'err'); }
    finally { btn.textContent = ' Analyze Quote'; btn.disabled = false; }
  });

  /* discount form */
  const discountForm = $('#pm2-discount-form');
  if (discountForm) discountForm.addEventListener('submit', async e => {
    e.preventDefault();
    try {
      const payload = Object.fromEntries(new FormData(e.target).entries());
      Object.keys(payload).forEach(k => payload[k] = Number(payload[k]));
      const out = await api('/tools/discount-calculator', { method: 'POST', body: payload });
      const el = $('#pm2-discount-out');
      if (el) el.innerHTML = `<div class="pm2-analysis-result">
        <div class="pm2-analysis-score">Savings: <strong>${money(out.discount_amount)}</strong></div>
        <div>Final Price: <strong>${money(out.final_price)}</strong></div>
      </div>`;
    } catch(err) { toast(err.message, 'err'); }
  });

  /* ===== MONITOR FORM ===== */
  const monitorForm = $('#pm2-monitor-form');
  if (monitorForm) monitorForm.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = $('#pm2-monitor-btn'); const txt = $('#pm2-monitor-btn-txt'); const spin = $('#pm2-monitor-spin');
    btn.disabled = true; txt.style.display = 'none'; spin.style.display = 'inline';
    try {
      const payload = Object.fromEntries(new FormData(e.target).entries());
      payload.base_price = Number(payload.base_price);
      if (payload.target_price) payload.target_price = Number(payload.target_price);
      payload.order_quantity = Number(payload.order_quantity || 1);
      payload.auto_order = !!e.target.querySelector('[name="auto_order"]')?.checked;
      const out = await api('/monitors', { method: 'POST', body: payload });
      await hydrate();
      toast(`📡 Monitoring ${out.product_name}! 30 days of price history loaded.`, 'ok');
      renderApp();
    } catch(err) { toast(err.message, 'err'); btn.disabled = false; txt.style.display = ''; spin.style.display = 'none'; }
  });

  /* check price now */
  $$('[data-check-monitor]').forEach(btn => btn.addEventListener('click', async () => {
    const id = btn.dataset.checkMonitor;
    const orig = btn.textContent; btn.textContent = '⏳'; btn.disabled = true;
    try {
      const out = await api(`/monitors/${id}/check`, { method: 'POST' });
      const cur = state.user?.currency || 'INR';
      const changeSign = out.price_change_pct > 0 ? '+' : '';
      let msg = `${money(out.new_price, cur)} (${changeSign}${out.price_change_pct}%)`;
      if (out.is_new_low) msg += ' 🏆 ALL-TIME LOW!';
      else if (out.is_at_target) msg += ' 🎯 TARGET HIT!';
      if (out.order_triggered) msg += ' 🛒 Auto-ordered!';
      toast(msg, out.is_new_low || out.is_at_target ? 'xp' : 'ok');
      state.monitors = await api('/monitors');
      state.monitorOrders = await api('/monitor-orders');
      state.notifications = (await api('/notifications'))?.notifications || [];
      renderApp();
    } catch(err) { toast(err.message, 'err'); }
    finally { btn.textContent = orig; btn.disabled = false; }
  }));

  /* delete monitor */
  $$('[data-delete-monitor]').forEach(btn => btn.addEventListener('click', async () => {
    if (!confirm('Stop monitoring this product?')) return;
    try {
      await api(`/monitors/${btn.dataset.deleteMonitor}`, { method: 'DELETE' });
      state.monitors = await api('/monitors');
      toast('Monitor removed', 'ok'); renderApp();
    } catch(err) { toast(err.message, 'err'); }
  }));

  /* toggle auto-order */
  $$('[data-toggle-autoorder]').forEach(btn => btn.addEventListener('click', async () => {
    const id = btn.dataset.toggleAutoorder;
    const current = btn.dataset.current === '1';
    try {
      await api(`/monitors/${id}`, { method: 'PATCH', body: { auto_order: !current } });
      state.monitors = await api('/monitors');
      toast(`Auto-order ${!current ? 'enabled' : 'disabled'}`, 'ok'); renderApp();
    } catch(err) { toast(err.message, 'err'); }
  }));

  /* confirm auto-order */
  $$('[data-confirm-order]').forEach(btn => btn.addEventListener('click', async () => {
    try {
      await api(`/monitor-orders/${btn.dataset.confirmOrder}/confirm`, { method: 'PATCH' });
      state.monitorOrders = await api('/monitor-orders');
      state.notifications = (await api('/notifications'))?.notifications || [];
      toast('✅ Order confirmed!', 'xp'); renderApp();
    } catch(err) { toast(err.message, 'err'); }
  }));

  /* cancel auto-order */
  $$('[data-cancel-order]').forEach(btn => btn.addEventListener('click', async () => {
    try {
      await api(`/monitor-orders/${btn.dataset.cancelOrder}/cancel`, { method: 'PATCH' });
      state.monitorOrders = await api('/monitor-orders');
      toast('Order cancelled', 'ok'); renderApp();
    } catch(err) { toast(err.message, 'err'); }
  }));
}

bootstrap();
