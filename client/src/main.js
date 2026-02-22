// ==================== PriceMind Enhanced Frontend ====================
const API = '/api';
let token = localStorage.getItem('pricemind_token');
let currentPage = 'dashboard';
let dashboardData = null;
let userPrefs = JSON.parse(localStorage.getItem('pricemind_prefs') || '{}');
const $ = id => document.getElementById(id);
const TOAST_DURATION = 3000;

// ==================== UTILITIES ====================
async function request(path, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  try {
    const res = await fetch(`${API}${path}`, { ...options, headers: { ...headers, ...options.headers } });
    if (res.status === 401) { token = null; localStorage.removeItem('pricemind_token'); renderApp(); return null; }
    const data = await res.json();
    if (!res.ok && data.error) { showToast(data.error, 'error'); return null; }
    return data;
  } catch (e) { showToast('Network error', 'error'); return null; }
}

function setToken(t) { token = t; localStorage.setItem('pricemind_token', t); }
function isLoggedIn() { return !!token; }

function showToast(message, type = 'success') {
  const container = document.querySelector('.toast-container') || (() => { const d = document.createElement('div'); d.className = 'toast-container'; document.body.appendChild(d); return d; })();
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span class="toast-icon">${type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'}</span><span>${message}</span>`;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, TOAST_DURATION);
}

function animateCounter(el, target, duration = 1000) {
  let start = 0; const step = target / (duration / 16);
  const timer = setInterval(() => { start += step; if (start >= target) { el.textContent = typeof target === 'number' && target % 1 !== 0 ? target.toFixed(2) : target; clearInterval(timer); } else { el.textContent = typeof target === 'number' && target % 1 !== 0 ? start.toFixed(2) : Math.floor(start); } }, 16);
}

function formatCurrency(amount, currency = 'USD') { return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount); }
function formatDate(date) { return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
function formatDateShort(date) { return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
function timeAgo(date) { const s = Math.floor((Date.now() - new Date(date)) / 1000); if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + 'm ago'; if (s < 86400) return Math.floor(s / 3600) + 'h ago'; return Math.floor(s / 86400) + 'd ago'; }

function debounce(fn, delay = 300) { let timer; return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); }; }

function showModal(title, content, actions = '') {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `<div class="modal"><div class="modal-header"><h3>${title}</h3><button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button></div><div class="modal-body">${content}</div>${actions ? `<div class="modal-footer">${actions}</div>` : ''}</div>`;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('show'));
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  return overlay;
}

// ==================== APP RENDER ====================
function renderApp() {
  const app = document.getElementById('app');
  if (!isLoggedIn()) { app.innerHTML = renderAuth(); bindAuth(); }
  else { app.innerHTML = renderShell(); bindNav(); navigateTo(currentPage); }
}

// ==================== AUTH ====================
function renderAuth() {
  return `
  <div class="auth-container">
    <div class="auth-bg-shapes">
      <div class="shape shape-1"></div><div class="shape shape-2"></div><div class="shape shape-3"></div>
    </div>
    <div class="auth-card">
      <div class="auth-logo">
        <div class="logo-icon">💰</div>
        <h1>PriceMind</h1>
        <p class="subtitle">AI-Powered Price Intelligence</p>
      </div>
      <div class="tabs">
        <button class="tab active" data-tab="login">Sign In</button>
        <button class="tab" data-tab="register">Create Account</button>
      </div>
      <form id="login-form">
        <div class="input-group"><span class="input-icon">📧</span><input type="email" id="l-email" placeholder="Email address" required /></div>
        <div class="input-group"><span class="input-icon">🔒</span><input type="password" id="l-pass" placeholder="Password" required /></div>
        <button type="submit" class="btn-primary btn-glow">Sign In →</button>
      </form>
      <form id="register-form" style="display:none">
        <div class="input-group"><span class="input-icon">👤</span><input type="text" id="r-name" placeholder="Full Name" required /></div>
        <div class="input-group"><span class="input-icon">📧</span><input type="email" id="r-email" placeholder="Email address" required /></div>
        <div class="input-group"><span class="input-icon">🔒</span><input type="password" id="r-pass" placeholder="Password (min 6 chars)" required minlength="6" /></div>
        <div class="input-row">
          <div class="input-group"><span class="input-icon">🏙️</span><input type="text" id="r-city" placeholder="City" /></div>
          <div class="input-group"><span class="input-icon">🌍</span><input type="text" id="r-country" placeholder="Country" /></div>
        </div>
        <button type="submit" class="btn-primary btn-glow">Create Account →</button>
      </form>
      <div id="auth-error" class="error"></div>
      <div class="auth-features">
        <div class="auth-feature"><span>🧠</span>AI Analysis</div>
        <div class="auth-feature"><span>📊</span>Track Prices</div>
        <div class="auth-feature"><span>💡</span>Save Money</div>
        <div class="auth-feature"><span>🔔</span>Price Alerts</div>
      </div>
    </div>
  </div>`;
}

function bindAuth() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.onclick = () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      $('login-form').style.display = tab.dataset.tab === 'login' ? 'flex' : 'none';
      $('register-form').style.display = tab.dataset.tab === 'register' ? 'flex' : 'none';
      $('auth-error').textContent = '';
    };
  });
  $('login-form').onsubmit = async (e) => {
    e.preventDefault(); const btn = e.target.querySelector('button'); btn.disabled = true; btn.textContent = 'Signing in...';
    const data = await request('/auth/login', { method: 'POST', body: JSON.stringify({ email: $('l-email').value, password: $('l-pass').value }) });
    if (data?.token) { setToken(data.token); showToast('Welcome back!'); renderApp(); }
    else { $('auth-error').textContent = data?.error || 'Login failed'; btn.disabled = false; btn.textContent = 'Sign In →'; }
  };
  $('register-form').onsubmit = async (e) => {
    e.preventDefault(); const btn = e.target.querySelector('button'); btn.disabled = true; btn.textContent = 'Creating account...';
    const data = await request('/auth/register', { method: 'POST', body: JSON.stringify({ name: $('r-name').value, email: $('r-email').value, password: $('r-pass').value, city: $('r-city').value, country: $('r-country').value }) });
    if (data?.token) { setToken(data.token); showToast('Account created! Welcome!'); renderApp(); }
    else { $('auth-error').textContent = data?.error || 'Registration failed'; btn.disabled = false; btn.textContent = 'Create Account →'; }
  };
}

// ==================== SHELL ====================
function renderShell() {
  return `
  <div class="app-shell">
    <nav class="sidebar" id="sidebar">
      <div class="sidebar-header">
        <div class="logo"><span class="logo-icon-sm">💰</span><h2>PriceMind</h2></div>
        <button class="sidebar-toggle" id="sidebar-toggle">☰</button>
      </div>
      <ul class="nav-list">
        <li class="nav-section">Main</li>
        <li><a href="#" data-page="dashboard" class="nav-link active"><span class="nav-icon">📊</span><span class="nav-text">Dashboard</span></a></li>
        <li><a href="#" data-page="add-price" class="nav-link"><span class="nav-icon">💰</span><span class="nav-text">Add Price</span></a></li>
        <li><a href="#" data-page="search" class="nav-link"><span class="nav-icon">🔍</span><span class="nav-text">Search</span></a></li>
        <li class="nav-section">Finance</li>
        <li><a href="#" data-page="spending" class="nav-link"><span class="nav-icon">📈</span><span class="nav-text">Spending</span></a></li>
        <li><a href="#" data-page="budgets" class="nav-link"><span class="nav-icon">🎯</span><span class="nav-text">Budgets</span></a></li>
        <li><a href="#" data-page="savings" class="nav-link"><span class="nav-icon">🏦</span><span class="nav-text">Savings</span></a></li>
        <li><a href="#" data-page="bills" class="nav-link"><span class="nav-icon">📋</span><span class="nav-text">Bills</span></a></li>
        <li class="nav-section">Tools</li>
        <li><a href="#" data-page="services" class="nav-link"><span class="nav-icon">🔧</span><span class="nav-text">Service Quotes</span></a></li>
        <li><a href="#" data-page="alerts" class="nav-link"><span class="nav-icon">🔔</span><span class="nav-text">Alerts</span><span id="alert-badge" class="nav-badge" style="display:none">0</span></a></li>
        <li><a href="#" data-page="watchlist" class="nav-link"><span class="nav-icon">⭐</span><span class="nav-text">Watchlist</span></a></li>
        <li class="nav-section">Insights</li>
        <li><a href="#" data-page="analytics" class="nav-link"><span class="nav-icon">📉</span><span class="nav-text">Analytics</span></a></li>
        <li><a href="#" data-page="deals" class="nav-link"><span class="nav-icon">🏷️</span><span class="nav-text">Best Deals</span></a></li>
        <li><a href="#" data-page="community" class="nav-link"><span class="nav-icon">👥</span><span class="nav-text">Community</span></a></li>
        <li class="nav-section">Account</li>
        <li><a href="#" data-page="profile" class="nav-link"><span class="nav-icon">👤</span><span class="nav-text">Profile</span></a></li>
        <li><a href="#" data-page="settings" class="nav-link"><span class="nav-icon">⚙️</span><span class="nav-text">Settings</span></a></li>
      </ul>
      <div class="nav-footer">
        <button id="logout-btn" class="btn-logout">🚪 Sign Out</button>
      </div>
    </nav>
    <main class="content" id="main-content"></main>
    <nav class="mobile-nav">
      <a href="#" data-page="dashboard" class="mobile-link active"><span>📊</span><small>Home</small></a>
      <a href="#" data-page="add-price" class="mobile-link"><span>💰</span><small>Add</small></a>
      <a href="#" data-page="search" class="mobile-link"><span>🔍</span><small>Search</small></a>
      <a href="#" data-page="spending" class="mobile-link"><span>📈</span><small>Spend</small></a>
      <a href="#" data-page="alerts" class="mobile-link"><span>🔔</span><small>Alerts</small></a>
    </nav>
  </div>`;
}

function bindNav() {
  document.querySelectorAll('.nav-link, .mobile-link').forEach(link => {
    link.onclick = (e) => { e.preventDefault(); navigateTo(link.dataset.page); };
  });
  $('logout-btn').onclick = () => { token = null; localStorage.removeItem('pricemind_token'); showToast('Signed out'); renderApp(); };
  $('sidebar-toggle').onclick = () => { $('sidebar').classList.toggle('collapsed'); };
}

async function navigateTo(page) {
  currentPage = page;
  document.querySelectorAll('.nav-link, .mobile-link').forEach(l => l.classList.toggle('active', l.dataset.page === page));
  const main = $('main-content');
  main.innerHTML = '<div class="page-loading"><div class="spinner"></div><p>Loading...</p></div>';
  main.scrollTop = 0;

  switch (page) {
    case 'dashboard': await renderDashboard(main); break;
    case 'add-price': renderAddPrice(main); break;
    case 'search': await renderSearch(main); break;
    case 'services': await renderServices(main); break;
    case 'spending': await renderSpending(main); break;
    case 'budgets': await renderBudgets(main); break;
    case 'savings': await renderSavings(main); break;
    case 'bills': await renderBills(main); break;
    case 'alerts': await renderAlerts(main); break;
    case 'watchlist': await renderWatchlist(main); break;
    case 'analytics': await renderAnalytics(main); break;
    case 'deals': await renderDeals(main); break;
    case 'community': await renderCommunity(main); break;
    case 'profile': await renderProfile(main); break;
    case 'settings': await renderSettings(main); break;
  }
  main.classList.add('page-enter');
  setTimeout(() => main.classList.remove('page-enter'), 300);
}

// ==================== DASHBOARD ====================
async function renderDashboard(c) {
  dashboardData = await request('/dashboard');
  if (!dashboardData) return;
  const d = dashboardData;
  c.innerHTML = `
    <div class="page-header"><h1>Dashboard</h1><p class="page-subtitle">Welcome back, ${d.user.name || 'User'}! Here's your financial overview.</p></div>
    <div class="stats-grid-4">
      <div class="stat-card gradient-blue"><div class="stat-icon">📊</div><div class="stat-content"><div class="stat-number" data-count="${d.total_contributions}">0</div><div class="stat-label">Prices Added</div></div></div>
      <div class="stat-card gradient-green"><div class="stat-icon">💰</div><div class="stat-content"><div class="stat-number">${formatCurrency(d.monthly_spend)}</div><div class="stat-label">Monthly Spend</div></div></div>
      <div class="stat-card gradient-purple"><div class="stat-icon">🔔</div><div class="stat-content"><div class="stat-number" data-count="${d.active_alerts}">0</div><div class="stat-label">Active Alerts</div></div></div>
      <div class="stat-card gradient-amber"><div class="stat-icon">🏦</div><div class="stat-content"><div class="stat-number">${formatCurrency(d.savings?.total_saved || 0)}</div><div class="stat-label">Total Saved</div></div></div>
    </div>

    ${d.triggered_alerts.length > 0 ? `<div class="alert-banner success"><span class="alert-banner-icon">🔔</span><div><strong>${d.triggered_alerts.length} Price Drop Alert${d.triggered_alerts.length > 1 ? 's' : ''}!</strong><p>${d.triggered_alerts.map(a => a.product_name).join(', ')}</p></div><button onclick="navigateTo('alerts')" class="btn-sm">View</button></div>` : ''}

    ${d.unread_notifications > 0 ? `<div class="alert-banner info"><span class="alert-banner-icon">📬</span><div><strong>${d.unread_notifications} new notification${d.unread_notifications > 1 ? 's' : ''}</strong></div></div>` : ''}

    <div class="dashboard-grid">
      <div class="dash-card">
        <div class="dash-card-header"><h3>💰 Quick Add Price</h3></div>
        <form id="quick-price-form" class="quick-form">
          <input type="text" id="qp-name" placeholder="Product name" required />
          <div class="input-row"><input type="number" id="qp-price" step="0.01" placeholder="Price" required /><input type="text" id="qp-store" placeholder="Store" /></div>
          <button type="submit" class="btn-primary btn-sm">🧠 Add & Analyze</button>
        </form>
      </div>

      <div class="dash-card">
        <div class="dash-card-header"><h3>🎯 Budget Overview</h3><a href="#" onclick="navigateTo('budgets');return false" class="link-sm">View All</a></div>
        ${d.budget_overview.length > 0 ? d.budget_overview.map(b => `
          <div class="budget-mini"><div class="budget-mini-header"><span>${b.category}</span><span class="${b.pct > 90 ? 'text-danger' : b.pct > 70 ? 'text-warning' : 'text-success'}">${b.pct}%</span></div>
          <div class="progress-bar"><div class="progress-fill ${b.pct > 90 ? 'danger' : b.pct > 70 ? 'warning' : ''}" style="width:${Math.min(b.pct, 100)}%"></div></div>
          <div class="budget-mini-footer"><span>${formatCurrency(b.spent)}</span><span>of ${formatCurrency(b.budget)}</span></div></div>
        `).join('') : '<p class="empty-sm">No budgets set. <a href="#" onclick="navigateTo(\'budgets\');return false">Create one →</a></p>'}
      </div>

      <div class="dash-card span-2">
        <div class="dash-card-header"><h3>📋 Recent Prices</h3><a href="#" onclick="navigateTo('search');return false" class="link-sm">View All</a></div>
        <div class="table-modern">
          <table>
            <thead><tr><th></th><th>Product</th><th>Price</th><th>Store</th><th>Rating</th><th>Date</th></tr></thead>
            <tbody>
              ${d.recent_prices.map(p => `<tr class="table-row-hover">
                <td>${p.icon || '📦'}</td><td class="fw-medium">${p.product_name}</td>
                <td class="price-cell">${formatCurrency(p.price)}</td><td>${p.store_name || '—'}</td>
                <td><span class="rating-badge ${p.ai_rating || 'fair'}">${(p.ai_rating || 'N/A').toUpperCase()}</span></td>
                <td class="text-muted">${timeAgo(p.created_at)}</td></tr>`).join('')}
              ${d.recent_prices.length === 0 ? '<tr><td colspan="6" class="empty-sm">No prices yet. Start adding!</td></tr>' : ''}
            </tbody>
          </table>
        </div>
      </div>

      <div class="dash-card">
        <div class="dash-card-header"><h3>🏷️ Recent Deals</h3></div>
        ${d.recent_deals?.length > 0 ? d.recent_deals.map(deal => `
          <div class="deal-mini"><span class="deal-icon">${deal.icon}</span><div class="deal-info"><strong>${deal.product_name}</strong><span>${deal.store || ''} • Score: ${deal.score}/100</span></div><span class="deal-price">${formatCurrency(deal.price)}</span></div>
        `).join('') : '<p class="empty-sm">No deals found yet.</p>'}
      </div>

      <div class="dash-card">
        <div class="dash-card-header"><h3>📋 Upcoming Bills</h3><a href="#" onclick="navigateTo('bills');return false" class="link-sm">View All</a></div>
        ${d.upcoming_bills?.length > 0 ? d.upcoming_bills.map(b => `
          <div class="bill-mini"><span class="bill-icon">📋</span><div class="bill-info"><strong>${b.name}</strong><span>Due: ${formatDate(b.due_date)}</span></div><span class="bill-amount">${formatCurrency(b.amount)}</span></div>
        `).join('') : '<p class="empty-sm">No upcoming bills.</p>'}
      </div>
    </div>`;

  // Animate counters
  c.querySelectorAll('[data-count]').forEach(el => { const target = parseInt(el.dataset.count); animateCounter(el, target); });

  // Quick price form
  $('quick-price-form').onsubmit = async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button'); btn.disabled = true; btn.textContent = '🧠 Analyzing...';
    const data = await request('/prices', { method: 'POST', body: JSON.stringify({ product_name: $('qp-name').value, price: parseFloat($('qp-price').value), store_name: $('qp-store').value }) });
    if (data?.analysis) { showToast(`Price added! Rating: ${data.analysis.rating?.toUpperCase()} (${data.analysis.score}/100)`); e.target.reset(); }
    btn.disabled = false; btn.textContent = '🧠 Add & Analyze';
  };
}

// ==================== ADD PRICE ====================
function renderAddPrice(c) {
  c.innerHTML = `
    <div class="page-header"><h1>💰 Add a Price</h1><p class="page-subtitle">Help the community by sharing prices you find</p></div>
    <div class="form-card glass-card">
      <form id="price-form">
        <div class="form-section"><h3>Product Details</h3>
          <div class="form-group"><label>Product Name <span class="required">*</span></label><input type="text" id="p-name" placeholder="e.g., Whole Milk 1 Gallon" required /><small class="form-hint">Be specific for better AI analysis</small></div>
          <div class="input-row">
            <div class="form-group"><label>Barcode</label><input type="text" id="p-barcode" placeholder="Scan or type" /></div>
            <div class="form-group"><label>Photo URL</label><input type="url" id="p-photo" placeholder="https://..." /></div>
          </div>
        </div>
        <div class="form-section"><h3>Pricing</h3>
          <div class="input-row-3">
            <div class="form-group"><label>Price <span class="required">*</span></label><div class="input-with-prefix"><span class="prefix">$</span><input type="number" id="p-price" step="0.01" placeholder="0.00" required /></div></div>
            <div class="form-group"><label>Currency</label><select id="p-currency"><option>USD</option><option>EUR</option><option>GBP</option><option>INR</option><option>JPY</option><option>CAD</option><option>AUD</option></select></div>
            <div class="form-group"><label>Unit</label><input type="text" id="p-unit" placeholder="e.g., gallon, lb" /></div>
          </div>
          <div class="form-group"><label class="checkbox-label"><input type="checkbox" id="p-sale" /><span class="checkmark"></span> This is a sale/discount price</label></div>
        </div>
        <div class="form-section"><h3>Location</h3>
          <div class="input-row-3">
            <div class="form-group"><label>Store Name</label><input type="text" id="p-store" placeholder="e.g., Walmart" /></div>
            <div class="form-group"><label>City</label><input type="text" id="p-city" placeholder="e.g., New York" /></div>
            <div class="form-group"><label>Country</label><input type="text" id="p-country" placeholder="e.g., USA" /></div>
          </div>
        </div>
        <div class="form-group"><label>Notes</label><textarea id="p-notes" placeholder="Any additional info..." rows="2"></textarea></div>
        <button type="submit" class="btn-primary btn-glow btn-lg">🧠 Analyze & Submit Price</button>
      </form>
    </div>
    <div id="price-result" style="display:none"></div>`;

  $('price-form').onsubmit = async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]'); btn.disabled = true; btn.innerHTML = '<span class="spinner-sm"></span> AI Analyzing...';
    const data = await request('/prices', { method: 'POST', body: JSON.stringify({
      product_name: $('p-name').value, barcode: $('p-barcode').value, price: parseFloat($('p-price').value),
      currency: $('p-currency').value, store_name: $('p-store').value, city: $('p-city').value,
      country: $('p-country').value, is_sale: $('p-sale').checked, notes: $('p-notes').value,
      photo_url: $('p-photo').value, unit: $('p-unit').value
    })});
    btn.disabled = false; btn.innerHTML = '🧠 Analyze & Submit Price';
    if (data?.analysis) {
      const a = data.analysis;
      const ratingColors = { cheap: '#22c55e', fair: '#3b82f6', average: '#f59e0b', expensive: '#ef4444', overpriced: '#dc2626' };
      $('price-result').style.display = 'block';
      $('price-result').innerHTML = `
        <div class="result-card glass-card animate-in">
          <h3>🧠 AI Price Analysis</h3>
          <div class="analysis-grid-4">
            <div class="analysis-item"><div class="analysis-badge" style="background:${ratingColors[a.rating] || '#666'}">${a.rating?.toUpperCase()}</div><span>Rating</span></div>
            <div class="analysis-item"><div class="analysis-score">${a.score}<small>/100</small></div><span>Deal Score</span></div>
            <div class="analysis-item"><div class="analysis-score">${a.percentile}<small>%</small></div><span>Percentile</span></div>
            <div class="analysis-item"><div class="trend-icon">${a.predicted_trend === 'rising' ? '📈' : a.predicted_trend === 'falling' ? '📉' : '➡️'}</div><span>${a.predicted_trend || 'Stable'}</span></div>
          </div>
          <div class="insight-cards">
            <div class="insight"><span class="insight-icon">💡</span><p>${a.suggestion}</p></div>
            <div class="insight"><span class="insight-icon">⏰</span><p>${a.best_time_to_buy}</p></div>
            ${a.savings_tip ? `<div class="insight"><span class="insight-icon">💵</span><p>${a.savings_tip}</p></div>` : ''}
            ${a.alternative_suggestion ? `<div class="insight"><span class="insight-icon">🔄</span><p>${a.alternative_suggestion}</p></div>` : ''}
          </div>
          ${data.alerts_triggered > 0 ? `<div class="alert-banner success mt-16"><span>🔔</span> ${data.alerts_triggered} alert(s) triggered!</div>` : ''}
        </div>`;
      e.target.reset();
      showToast('Price submitted successfully!');
    }
  };
}

// ==================== SEARCH ====================
async function renderSearch(c) {
  const categories = await request('/categories');
  c.innerHTML = `
    <div class="page-header"><h1>🔍 Search Prices</h1><p class="page-subtitle">Find and compare prices across stores</p></div>
    <div class="search-panel glass-card">
      <div class="search-main"><input type="text" id="search-q" placeholder="Search any product..." class="search-input-lg" /><button id="search-btn" class="btn-primary">🔍 Search</button></div>
      <div class="search-filters">
        <select id="search-cat"><option value="">All Categories</option>${categories?.map(c => `<option value="${c.name}">${c.icon} ${c.name}</option>`).join('')}</select>
        <input type="text" id="search-city" placeholder="City" />
        <input type="text" id="search-store" placeholder="Store" />
        <select id="search-sort"><option value="">Latest</option><option value="price_asc">Price: Low→High</option><option value="price_desc">Price: High→Low</option><option value="entries">Most Entries</option></select>
        <div class="price-range"><input type="number" id="search-min" placeholder="Min $" step="0.01" /><span>—</span><input type="number" id="search-max" placeholder="Max $" step="0.01" /></div>
      </div>
    </div>
    <div id="search-results"></div>
    <div class="section"><div class="section-header"><h2>🔥 Trending Products</h2></div><div id="trending-list" class="trending-grid"></div></div>`;

  const trending = await request('/prices/trending');
  if (trending?.length > 0) {
    $('trending-list').innerHTML = trending.map(t => `
      <div class="trending-card" onclick="viewProduct(${t.id})">
        <div class="trending-icon">${t.icon || '📦'}</div>
        <div class="trending-info"><strong>${t.name}</strong><span class="text-muted">${t.category || ''} • ${t.entry_count} entries</span></div>
        <div class="trending-prices"><span class="price-main">${formatCurrency(t.avg_price)}</span><span class="price-range-sm">${formatCurrency(t.min_price)} — ${formatCurrency(t.max_price)}</span></div>
      </div>`).join('');
  } else { $('trending-list').innerHTML = '<p class="empty-state">No trending products yet. Start adding prices!</p>'; }

  async function doSearch() {
    const q = $('search-q').value; if (!q) return;
    $('search-results').innerHTML = '<div class="page-loading"><div class="spinner"></div></div>';
    const params = new URLSearchParams({ q, city: $('search-city').value, category: $('search-cat').value, store: $('search-store').value, sort: $('search-sort').value });
    if ($('search-min').value) params.set('min_price', $('search-min').value);
    if ($('search-max').value) params.set('max_price', $('search-max').value);
    const results = await request(`/prices/search?${params}`);
    if (results?.length > 0) {
      $('search-results').innerHTML = `<div class="results-header"><span>${results.length} results found</span></div><div class="results-grid">${results.map(r => `
        <div class="result-card glass-card" onclick="viewProduct(${r.product_id})">
          <div class="result-top"><span class="result-icon">${r.category_icon || '📦'}</span><strong>${r.product_name}</strong></div>
          <div class="result-prices-row">
            <div class="result-price-main">${formatCurrency(r.price)}</div>
            <div class="result-price-stats"><span>Avg: ${formatCurrency(r.avg_price)}</span><span>Range: ${formatCurrency(r.min_price)} — ${formatCurrency(r.max_price)}</span></div>
          </div>
          <div class="result-meta"><span>${r.store_name || ''}</span>${r.city ? `<span>📍 ${r.city}</span>` : ''}<span>${r.total_entries} entries</span></div>
          <div class="result-actions"><button class="btn-sm btn-outline" onclick="event.stopPropagation();addToWatchlist(${r.product_id})">⭐ Watch</button><button class="btn-sm btn-outline" onclick="event.stopPropagation();createAlertFromSearch(${r.product_id},'${r.product_name.replace(/'/g,"\\'")}',${r.avg_price})">🔔 Alert</button></div>
        </div>`).join('')}</div>`;
    } else { $('search-results').innerHTML = '<p class="empty-state">No results found. Try different keywords.</p>'; }
  }

  $('search-btn').onclick = doSearch;
  $('search-q').onkeyup = (e) => { if (e.key === 'Enter') doSearch(); };
}

async function viewProduct(productId) {
  const data = await request(`/prices/product/${productId}`);
  if (!data) return;
  const p = data.product;
  const s = data.stats;
  const modal = showModal(`${p.icon || '📦'} ${p.name}`, `
    <div class="product-detail">
      <div class="product-stats-grid">
        <div class="pstat"><span class="pstat-label">Average</span><span class="pstat-value">${formatCurrency(s.avg)}</span></div>
        <div class="pstat"><span class="pstat-label">Lowest</span><span class="pstat-value text-success">${formatCurrency(s.min)}</span></div>
        <div class="pstat"><span class="pstat-label">Highest</span><span class="pstat-value text-danger">${formatCurrency(s.max)}</span></div>
        <div class="pstat"><span class="pstat-label">Entries</span><span class="pstat-value">${s.count}</span></div>
      </div>
      ${data.stores.length > 0 ? `<h4>🏪 Store Comparison</h4><div class="store-comparison">${data.stores.map((st, i) => `
        <div class="store-row ${i === 0 ? 'best-deal' : ''}"><span class="store-name">${i === 0 ? '🏆 ' : ''}${st.store}</span><span class="store-price">${formatCurrency(st.latest_price)}</span><span class="text-muted">(avg ${formatCurrency(st.avg_price)})</span></div>
      `).join('')}</div>` : ''}
      <h4>📊 Price History</h4>
      <div class="price-chart">${data.history.slice(-20).map((h, i, arr) => {
        const maxP = Math.max(...arr.map(x => x.price));
        const minP = Math.min(...arr.map(x => x.price));
        const range = maxP - minP || 1;
        const height = ((h.price - minP) / range * 80) + 10;
        return `<div class="chart-bar-wrap" title="${formatDate(h.date)}: ${formatCurrency(h.price)}"><div class="chart-bar" style="height:${height}%"></div><small>${formatDateShort(h.date)}</small></div>`;
      }).join('')}</div>
      <h4>Recent Entries</h4>
      <div class="price-history-list">${data.prices.slice(0, 10).map(pe => `
        <div class="ph-row"><span class="text-muted">${formatDate(pe.created_at)}</span><span class="fw-medium">${formatCurrency(pe.price)}</span><span>${pe.store_name || '—'}</span><span class="text-muted">${pe.user_name}</span></div>
      `).join('')}</div>
    </div>`, `<button class="btn-primary" onclick="addToWatchlist(${productId});this.closest('.modal-overlay').remove()">⭐ Add to Watchlist</button><button class="btn-outline" onclick="createAlertFromSearch(${productId},'${p.name.replace(/'/g,"\\'")}',${s.avg});this.closest('.modal-overlay').remove()">🔔 Set Alert</button>`);
}

async function addToWatchlist(productId) {
  const result = await request('/watchlist', { method: 'POST', body: JSON.stringify({ product_id: productId }) });
  if (result) showToast('Added to watchlist!');
}

function createAlertFromSearch(productId, productName, avgPrice) {
  const modal = showModal('🔔 Create Price Alert', `
    <form id="alert-modal-form">
      <p>Alert for: <strong>${productName}</strong></p>
      <div class="form-group"><label>Alert when price drops below</label><div class="input-with-prefix"><span class="prefix">$</span><input type="number" id="am-price" step="0.01" value="${(avgPrice * 0.9).toFixed(2)}" required /></div></div>
      <button type="submit" class="btn-primary">Create Alert</button>
    </form>`);
  setTimeout(() => {
    $('alert-modal-form').onsubmit = async (e) => {
      e.preventDefault();
      await request('/alerts', { method: 'POST', body: JSON.stringify({ product_id: productId, target_price: parseFloat($('am-price').value), product_name: productName }) });
      showToast('Alert created!');
      modal.remove();
    };
  }, 100);
}

// ==================== SPENDING ====================
async function renderSpending(c) {
  let currentPeriod = 'month';
  c.innerHTML = `
    <div class="page-header"><h1>📈 Spending Tracker</h1><p class="page-subtitle">Track and analyze your expenses</p></div>
    <div class="glass-card compact-form">
      <form id="spend-form" class="inline-form">
        <select id="sp-cat"><option>Groceries</option><option>Transport</option><option>Dining</option><option>Utilities</option><option>Entertainment</option><option>Health</option><option>Shopping</option><option>Housing</option><option>Insurance</option><option>Education</option><option>Subscriptions</option><option>Other</option></select>
        <div class="input-with-prefix"><span class="prefix">$</span><input type="number" id="sp-amount" step="0.01" placeholder="Amount" required /></div>
        <input type="text" id="sp-desc" placeholder="Description" />
        <input type="date" id="sp-date" value="${new Date().toISOString().split('T')[0]}" />
        <button type="submit" class="btn-primary">+ Add</button>
      </form>
    </div>
    <div class="period-tabs"><button class="period-tab active" data-period="day">Day</button><button class="period-tab" data-period="week">Week</button><button class="period-tab" data-period="month">Month</button><button class="period-tab" data-period="year">Year</button></div>
    <div id="spending-data"></div>
    <div class="section"><div class="section-header"><h2>🧠 AI Spending Insights</h2></div><div id="spending-insights"><button id="get-insights" class="btn-primary btn-outline">🧠 Generate AI Insights</button></div></div>`;

  async function loadSpending(period) {
    currentPeriod = period;
    const data = await request(`/spending?period=${period}`);
    if (!data) return;
    const total = data.total || 0;
    $('spending-data').innerHTML = `
      <div class="spending-header"><div class="spending-total"><span class="total-label">${period.charAt(0).toUpperCase() + period.slice(1)}ly Total</span><span class="total-amount">${formatCurrency(total)}</span></div><div class="spending-avg"><span>Avg/day: ${formatCurrency(data.avg_daily)}</span></div></div>
      <div class="spending-grid">
        <div class="glass-card"><h3>📊 By Category</h3>
          <div class="category-bars">${data.by_category.map(cat => {
            const pct = total > 0 ? (cat.total / total * 100) : 0;
            return `<div class="cat-bar"><span class="cat-label">${cat.category}</span><div class="bar"><div class="bar-fill" style="width:${pct}%"></div></div><span class="cat-amount">${formatCurrency(cat.total)}</span><span class="cat-pct">${Math.round(pct)}%</span></div>`;
          }).join('')}</div>
        </div>
        ${data.by_date.length > 0 ? `<div class="glass-card"><h3>📅 Daily Breakdown</h3>
          <div class="daily-chart">${data.by_date.slice(-14).map(d => {
            const maxD = Math.max(...data.by_date.map(x => x.total));
            const height = maxD > 0 ? (d.total / maxD * 80) + 10 : 10;
            return `<div class="daily-bar-wrap" title="${formatDate(d.date)}: ${formatCurrency(d.total)}"><div class="daily-bar" style="height:${height}%"></div><small>${new Date(d.date).toLocaleDateString('en',{weekday:'short'}).slice(0,2)}</small></div>`;
          }).join('')}</div>
        </div>` : ''}
      </div>
      <div class="glass-card mt-16"><h3>📝 Transactions</h3>
        <div class="transactions-list">${data.entries.slice(0, 30).map(e => `
          <div class="transaction-row"><div class="transaction-cat">${e.category}</div><div class="transaction-info"><span class="fw-medium">${e.description || e.category}</span><span class="text-muted">${formatDate(e.date)}</span></div>
          <span class="transaction-amount">${formatCurrency(e.amount)}</span>
          <button class="btn-icon-sm" onclick="deleteSpending(${e.id}, this)">🗑️</button></div>
        `).join('')}
        ${data.entries.length === 0 ? '<p class="empty-sm">No expenses recorded yet.</p>' : ''}
        </div>
      </div>`;
  }

  await loadSpending('month');
  document.querySelectorAll('.period-tab').forEach(tab => {
    tab.onclick = () => { document.querySelectorAll('.period-tab').forEach(t => t.classList.remove('active')); tab.classList.add('active'); loadSpending(tab.dataset.period); };
  });

  $('spend-form').onsubmit = async (e) => {
    e.preventDefault();
    await request('/spending', { method: 'POST', body: JSON.stringify({ category: $('sp-cat').value, amount: parseFloat($('sp-amount').value), description: $('sp-desc').value, date: $('sp-date').value }) });
    showToast('Expense added!'); e.target.reset(); $('sp-date').value = new Date().toISOString().split('T')[0]; loadSpending(currentPeriod);
  };

  $('get-insights').onclick = async () => {
    $('spending-insights').innerHTML = '<div class="page-loading"><div class="spinner"></div><p>🧠 Generating insights...</p></div>';
    const insights = await request('/spending/insights');
    if (insights) {
      $('spending-insights').innerHTML = `
        <div class="insights-card glass-card">
          <div class="insight-header"><span class="grade-badge grade-${(insights.budget_grade || 'B').toLowerCase()}">${insights.budget_grade}</span><div><h3>Spending Analysis</h3><p>${insights.spending_personality || ''}</p></div></div>
          <p class="insight-summary">${insights.summary}</p>
          <div class="insight-sections">
            <div class="insight-section"><h4>💡 Savings Opportunities</h4><ul>${(insights.savings_opportunities || []).map(s => `<li>${s}</li>`).join('')}</ul></div>
            ${insights.danger_zones?.length > 0 ? `<div class="insight-section warning-section"><h4>⚠️ Danger Zones</h4><ul>${insights.danger_zones.map(d => `<li>${d}</li>`).join('')}</ul></div>` : ''}
            ${insights.achievements?.length > 0 ? `<div class="insight-section success-section"><h4>🏆 Achievements</h4><ul>${insights.achievements.map(a => `<li>${a}</li>`).join('')}</ul></div>` : ''}
          </div>
          <p class="text-muted mt-16">📊 ${insights.inflation_impact || ''}</p>
        </div>`;
    }
  };
}

async function deleteSpending(id, btn) { await request(`/spending/${id}`, { method: 'DELETE' }); btn.closest('.transaction-row').remove(); showToast('Deleted'); }

// ==================== BUDGETS ====================
async function renderBudgets(c) {
  const budgets = await request('/budgets');
  c.innerHTML = `
    <div class="page-header"><h1>🎯 Budget Manager</h1><p class="page-subtitle">Set and track spending limits by category</p></div>
    <div class="glass-card"><h3>Set Budget</h3>
      <form id="budget-form" class="inline-form">
        <select id="bg-cat"><option>Groceries</option><option>Transport</option><option>Dining</option><option>Utilities</option><option>Entertainment</option><option>Health</option><option>Shopping</option><option>Housing</option><option>Insurance</option><option>Education</option><option>Subscriptions</option><option>Other</option></select>
        <div class="input-with-prefix"><span class="prefix">$</span><input type="number" id="bg-amount" step="1" placeholder="Monthly budget" required /></div>
        <button type="submit" class="btn-primary">Set Budget</button>
      </form>
      <button id="smart-budget-btn" class="btn-outline mt-8">🧠 AI Smart Budget Suggestion</button>
    </div>
    <div id="smart-budget-result"></div>
    <div class="budgets-grid mt-16">${budgets?.map(b => `
      <div class="budget-card glass-card">
        <div class="budget-header"><h3>${b.category}</h3><button class="btn-icon-sm" onclick="deleteBudget(${b.id})">🗑️</button></div>
        <div class="budget-circle"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="45" fill="none" stroke="var(--border)" stroke-width="8"/><circle cx="50" cy="50" r="45" fill="none" stroke="${b.pct_used > 90 ? 'var(--danger)' : b.pct_used > 70 ? 'var(--warning)' : 'var(--success)'}" stroke-width="8" stroke-dasharray="${Math.min(b.pct_used, 100) * 2.83} 283" stroke-linecap="round" transform="rotate(-90 50 50)"/><text x="50" y="50" text-anchor="middle" dy="5" fill="var(--text)" font-size="18" font-weight="700">${b.pct_used}%</text></svg></div>
        <div class="budget-details"><span>${formatCurrency(b.spent)} spent</span><span>of ${formatCurrency(b.amount)}</span><span class="${b.remaining >= 0 ? 'text-success' : 'text-danger'}">${formatCurrency(Math.abs(b.remaining))} ${b.remaining >= 0 ? 'left' : 'over'}</span></div>
      </div>
    `).join('') || '<p class="empty-state">No budgets set yet. Create your first budget above!</p>'}</div>`;

  $('budget-form').onsubmit = async (e) => {
    e.preventDefault();
    await request('/budgets', { method: 'POST', body: JSON.stringify({ category: $('bg-cat').value, amount: parseFloat($('bg-amount').value) }) });
    showToast('Budget set!'); renderBudgets(c);
  };

  $('smart-budget-btn').onclick = async () => {
    $('smart-budget-result').innerHTML = '<div class="page-loading"><div class="spinner"></div><p>🧠 Analyzing your spending...</p></div>';
    const result = await request('/smart-budget', { method: 'POST', body: JSON.stringify({}) });
    if (result) {
      $('smart-budget-result').innerHTML = `<div class="glass-card mt-16"><h3>🧠 AI Budget Suggestions</h3>
        <div class="smart-budgets">${(result.suggested_budgets || []).map(b => `
          <div class="smart-budget-row"><span class="fw-medium">${b.category}</span><span class="price-cell">${formatCurrency(b.amount)}/mo</span><span class="text-muted">${b.reasoning}</span>
          <button class="btn-sm btn-outline" onclick="applyBudget('${b.category}',${b.amount})">Apply</button></div>
        `).join('')}</div>
        <p class="mt-8">💰 Suggested savings: ${formatCurrency(result.savings_target)}/month</p>
        ${result.tips?.map(t => `<p class="text-muted">💡 ${t}</p>`).join('') || ''}
      </div>`;
    }
  };
}

async function applyBudget(category, amount) {
  await request('/budgets', { method: 'POST', body: JSON.stringify({ category, amount }) });
  showToast(`Budget set: ${category} - ${formatCurrency(amount)}`);
}

async function deleteBudget(id) { await request(`/budgets/${id}`, { method: 'DELETE' }); showToast('Budget removed'); navigateTo('budgets'); }

// ==================== SAVINGS ====================
async function renderSavings(c) {
  const goals = await request('/savings');
  c.innerHTML = `
    <div class="page-header"><h1>🏦 Savings Goals</h1><p class="page-subtitle">Track your savings progress</p></div>
    <div class="glass-card"><h3>Create Savings Goal</h3>
      <form id="savings-form">
        <div class="input-row"><div class="form-group"><label>Goal Name</label><input type="text" id="sv-name" placeholder="e.g., Emergency Fund" required /></div><div class="form-group"><label>Target Amount</label><div class="input-with-prefix"><span class="prefix">$</span><input type="number" id="sv-target" step="1" placeholder="5000" required /></div></div></div>
        <div class="input-row"><div class="form-group"><label>Deadline</label><input type="date" id="sv-deadline" /></div><div class="form-group"><label>Icon</label><select id="sv-icon"><option value="🎯">🎯 Goal</option><option value="🏠">🏠 Home</option><option value="🚗">🚗 Car</option><option value="✈️">✈️ Travel</option><option value="🎓">🎓 Education</option><option value="💍">💍 Wedding</option><option value="🏥">🏥 Health</option><option value="💻">💻 Tech</option></select></div></div>
        <button type="submit" class="btn-primary">Create Goal</button>
      </form>
    </div>
    <div class="savings-grid mt-16">${goals?.map(g => {
      const pct = g.target_amount > 0 ? Math.round(g.current_amount / g.target_amount * 100) : 0;
      return `<div class="savings-card glass-card">
        <div class="savings-header"><span class="savings-icon">${g.icon || '🎯'}</span><div><h3>${g.name}</h3>${g.deadline ? `<span class="text-muted">By ${formatDate(g.deadline)}</span>` : ''}</div><button class="btn-icon-sm" onclick="deleteSavings(${g.id})">🗑️</button></div>
        <div class="savings-progress"><div class="progress-bar lg"><div class="progress-fill" style="width:${Math.min(pct, 100)}%"></div></div><div class="savings-amounts"><span>${formatCurrency(g.current_amount)}</span><span>${formatCurrency(g.target_amount)}</span></div><span class="savings-pct">${pct}%</span></div>
        <form class="deposit-form" onsubmit="return false;"><div class="input-with-prefix"><span class="prefix">$</span><input type="number" step="0.01" placeholder="Amount" class="deposit-input" /></div><button class="btn-sm btn-primary deposit-btn" data-id="${g.id}">+ Deposit</button></form>
      </div>`;
    }).join('') || '<p class="empty-state">No savings goals yet. Create one above!</p>'}</div>`;

  $('savings-form').onsubmit = async (e) => {
    e.preventDefault();
    await request('/savings', { method: 'POST', body: JSON.stringify({ name: $('sv-name').value, target_amount: parseFloat($('sv-target').value), deadline: $('sv-deadline').value, icon: $('sv-icon').value }) });
    showToast('Savings goal created!'); renderSavings(c);
  };

  document.querySelectorAll('.deposit-btn').forEach(btn => {
    btn.onclick = async () => {
      const input = btn.closest('.deposit-form').querySelector('.deposit-input');
      if (!input.value) return;
      await request(`/savings/${btn.dataset.id}/deposit`, { method: 'POST', body: JSON.stringify({ amount: parseFloat(input.value) }) });
      showToast('Deposit added!'); renderSavings(c);
    };
  });
}

async function deleteSavings(id) { await request(`/savings/${id}`, { method: 'DELETE' }); showToast('Goal removed'); navigateTo('savings'); }

// ==================== BILLS ====================
async function renderBills(c) {
  const bills = await request('/bills');
  c.innerHTML = `
    <div class="page-header"><h1>📋 Bill Reminders</h1><p class="page-subtitle">Never miss a payment</p></div>
    <div class="glass-card"><h3>Add Bill</h3>
      <form id="bill-form" class="inline-form">
        <input type="text" id="bl-name" placeholder="Bill name" required />
        <div class="input-with-prefix"><span class="prefix">$</span><input type="number" id="bl-amount" step="0.01" placeholder="Amount" required /></div>
        <input type="date" id="bl-date" required />
        <select id="bl-freq"><option value="monthly">Monthly</option><option value="weekly">Weekly</option><option value="yearly">Yearly</option><option value="once">One-time</option></select>
        <select id="bl-cat"><option>Utilities</option><option>Housing</option><option>Insurance</option><option>Subscriptions</option><option>Other</option></select>
        <button type="submit" class="btn-primary">Add</button>
      </form>
    </div>
    <div class="bills-list mt-16">${bills?.map(b => {
      const isOverdue = new Date(b.due_date) < new Date() && !b.is_paid;
      return `<div class="bill-card glass-card ${isOverdue ? 'overdue' : ''} ${b.is_paid ? 'paid' : ''}">
        <div class="bill-left"><span class="bill-freq-badge">${b.frequency}</span><div><strong>${b.name}</strong><span class="text-muted">${b.category} • Due: ${formatDate(b.due_date)}</span></div></div>
        <div class="bill-right"><span class="bill-amount">${formatCurrency(b.amount)}</span>
        ${b.is_paid ? '<span class="badge-success">✓ Paid</span>' : `<button class="btn-sm btn-primary" onclick="payBill(${b.id})">Mark Paid</button>`}
        <button class="btn-icon-sm" onclick="deleteBill(${b.id})">🗑️</button></div>
      </div>`;
    }).join('') || '<p class="empty-state">No bills added yet.</p>'}</div>`;

  $('bill-form').onsubmit = async (e) => {
    e.preventDefault();
    await request('/bills', { method: 'POST', body: JSON.stringify({ name: $('bl-name').value, amount: parseFloat($('bl-amount').value), due_date: $('bl-date').value, frequency: $('bl-freq').value, category: $('bl-cat').value }) });
    showToast('Bill added!'); renderBills(c);
  };
}

async function payBill(id) { await request(`/bills/${id}/paid`, { method: 'PATCH' }); showToast('Bill marked as paid!'); navigateTo('bills'); }
async function deleteBill(id) { await request(`/bills/${id}`, { method: 'DELETE' }); showToast('Bill removed'); navigateTo('bills'); }

// ==================== SERVICES ====================
async function renderServices(c) {
  c.innerHTML = `
    <div class="page-header"><h1>🔧 Service Quote Checker</h1><p class="page-subtitle">Get AI analysis for any service quote</p></div>
    <div class="glass-card">
      <form id="quote-form">
        <div class="input-row"><div class="form-group"><label>Service Type</label>
          <select id="sq-type"><option>Plumbing</option><option>Electrical</option><option>Auto Repair</option><option>Home Renovation</option><option>Dental</option><option>Medical</option><option>Legal</option><option>Accounting</option><option>Moving</option><option>Cleaning</option><option>Landscaping</option><option>Roofing</option><option>HVAC</option><option>Pest Control</option><option>Painting</option><option>Flooring</option><option>Other</option></select>
        </div><div class="form-group"><label>Quoted Price</label><div class="input-with-prefix"><span class="prefix">$</span><input type="number" id="sq-price" step="0.01" required /></div></div></div>
        <div class="form-group"><label>Description</label><textarea id="sq-desc" placeholder="Describe the work needed..." rows="3"></textarea></div>
        <div class="input-row-3"><div class="form-group"><label>Provider</label><input type="text" id="sq-provider" placeholder="Company name" /></div><div class="form-group"><label>City</label><input type="text" id="sq-city" /></div><div class="form-group"><label>Country</label><input type="text" id="sq-country" /></div></div>
        <button type="submit" class="btn-primary btn-glow btn-lg">🧠 Analyze Quote</button>
      </form>
    </div>
    <div id="quote-result" style="display:none"></div>
    <div class="section"><div class="section-header"><h2>📋 Past Quotes</h2></div><div id="past-quotes"></div></div>`;

  const quotes = await request('/services/quotes');
  if (quotes?.length > 0) {
    $('past-quotes').innerHTML = quotes.map(q => `
      <div class="quote-card glass-card"><div class="quote-header"><strong>${q.service_type}</strong><span class="price-cell">${formatCurrency(q.quoted_price)}</span></div>
      <div class="quote-meta"><span class="rating-badge ${q.ai_analysis?.rating || 'fair'}">${(q.ai_analysis?.rating || 'N/A').replace('_', ' ').toUpperCase()}</span><span>Score: ${q.ai_analysis?.fairness_score || '—'}/100</span><span class="text-muted">${formatDate(q.created_at)}</span></div></div>
    `).join('');
  } else { $('past-quotes').innerHTML = '<p class="empty-sm">No quotes analyzed yet.</p>'; }

  $('quote-form').onsubmit = async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]'); btn.disabled = true; btn.innerHTML = '<span class="spinner-sm"></span> Analyzing...';
    const data = await request('/services/quote', { method: 'POST', body: JSON.stringify({ service_type: $('sq-type').value, description: $('sq-desc').value, quoted_price: parseFloat($('sq-price').value), provider_name: $('sq-provider').value, city: $('sq-city').value, country: $('sq-country').value }) });
    btn.disabled = false; btn.innerHTML = '🧠 Analyze Quote';
    if (data?.analysis) {
      const a = data.analysis;
      const colors = { great_deal: '#22c55e', fair: '#3b82f6', slightly_high: '#f59e0b', overpriced: '#ef4444', suspicious: '#dc2626' };
      $('quote-result').style.display = 'block';
      $('quote-result').innerHTML = `
        <div class="result-card glass-card animate-in">
          <h3>🧠 AI Quote Analysis</h3>
          <div class="analysis-grid-3">
            <div class="analysis-item"><div class="analysis-badge" style="background:${colors[a.rating] || '#666'}">${a.rating?.replace('_', ' ').toUpperCase()}</div><span>Rating</span></div>
            <div class="analysis-item"><div class="analysis-score">${a.fairness_score}<small>/100</small></div><span>Fairness</span></div>
            <div class="analysis-item"><div class="analysis-range">${formatCurrency(a.typical_range?.low)} — ${formatCurrency(a.typical_range?.high)}</div><span>Typical Range</span></div>
          </div>
          <p class="mt-16">${a.analysis}</p>
          <div class="insight"><span class="insight-icon">💡</span><p>${a.negotiation_tip}</p></div>
          ${a.questions_to_ask?.length > 0 ? `<div class="insight"><span class="insight-icon">❓</span><div><p class="fw-medium">Questions to Ask:</p><ul>${a.questions_to_ask.map(q => `<li>${q}</li>`).join('')}</ul></div></div>` : ''}
          ${a.red_flags?.length > 0 ? `<div class="alert-banner warning mt-16"><span>⚠️</span> Red Flags: ${a.red_flags.join(', ')}</div>` : ''}
        </div>`;
      showToast('Quote analyzed!');
    }
  };
}

// ==================== ALERTS ====================
async function renderAlerts(c) {
  const alerts = await request('/alerts');
  c.innerHTML = `
    <div class="page-header"><h1>🔔 Price Alerts</h1><p class="page-subtitle">Get notified when prices drop</p></div>
    <div class="glass-card"><h3>Create Alert</h3>
      <form id="alert-form" class="inline-form">
        <input type="text" id="al-name" placeholder="Product name" required />
        <div class="input-with-prefix"><span class="prefix">$</span><input type="number" id="al-price" step="0.01" placeholder="Target price" required /></div>
        <button type="submit" class="btn-primary">Create Alert</button>
      </form>
    </div>
    <div class="alerts-grid mt-16">
      ${alerts?.length > 0 ? alerts.map(a => `
        <div class="alert-card glass-card ${a.triggered ? 'triggered' : ''} ${a.snoozed ? 'snoozed' : ''}">
          <div class="alert-status-icon">${a.triggered ? '✅' : a.snoozed ? '😴' : '👁️'}</div>
          <div class="alert-content"><strong>${a.product_name}</strong>
            <span class="text-muted">${a.alert_type === 'percentage' ? `Drop ${a.target_percentage}%` : `Below ${formatCurrency(a.target_price)}`}</span>
            <span class="text-muted">${formatDate(a.created_at)}</span>
          </div>
          <div class="alert-actions">
            ${a.triggered ? `<button class="btn-sm btn-outline" onclick="reactivateAlert(${a.id})">🔄 Reset</button>` : ''}
            ${!a.snoozed && !a.triggered ? `<button class="btn-sm btn-outline" onclick="snoozeAlert(${a.id})">😴 Snooze</button>` : ''}
            <button class="btn-sm btn-danger" onclick="deleteAlert(${a.id})">🗑️</button>
          </div>
        </div>
      `).join('') : '<p class="empty-state">No alerts set. Search for products and create alerts!</p>'}
    </div>`;

  $('alert-form').onsubmit = async (e) => {
    e.preventDefault();
    await request('/alerts', { method: 'POST', body: JSON.stringify({ product_name: $('al-name').value, target_price: parseFloat($('al-price').value) }) });
    showToast('Alert created!'); renderAlerts(c);
  };
}

async function deleteAlert(id) { await request(`/alerts/${id}`, { method: 'DELETE' }); showToast('Alert removed'); navigateTo('alerts'); }
async function snoozeAlert(id) { await request(`/alerts/${id}/snooze`, { method: 'PATCH', body: JSON.stringify({ days: 7 }) }); showToast('Alert snoozed for 7 days'); navigateTo('alerts'); }
async function reactivateAlert(id) { await request(`/alerts/${id}/reactivate`, { method: 'PATCH' }); showToast('Alert reactivated'); navigateTo('alerts'); }

// ==================== WATCHLIST ====================
async function renderWatchlist(c) {
  const items = await request('/watchlist');
  c.innerHTML = `
    <div class="page-header"><h1>⭐ Watchlist</h1><p class="page-subtitle">Track your favorite products</p></div>
    <div class="watchlist-grid">${items?.length > 0 ? items.map(w => `
      <div class="watchlist-card glass-card" onclick="viewProduct(${w.product_id})">
        <div class="wl-header"><span class="wl-icon">${w.icon || '📦'}</span><div><strong>${w.product_name}</strong><span class="text-muted">Tracking ${w.price_count} prices</span></div>
        <button class="btn-icon-sm" onclick="event.stopPropagation();removeWatchlist(${w.id})">✕</button></div>
        <div class="wl-prices">${w.latest_price ? `<span class="wl-current">${formatCurrency(w.latest_price)}</span>` : '<span class="text-muted">No prices</span>'}<span class="text-muted">Avg: ${formatCurrency(w.avg_price)}</span></div>
      </div>
    `).join('') : '<p class="empty-state">No items in watchlist. Search for products and add them!</p>'}</div>`;
}

async function removeWatchlist(id) { await request(`/watchlist/${id}`, { method: 'DELETE' }); showToast('Removed from watchlist'); navigateTo('watchlist'); }

// ==================== ANALYTICS ====================
async function renderAnalytics(c) {
  const data = await request('/analytics');
  if (!data) return;
  c.innerHTML = `
    <div class="page-header"><h1>📉 Analytics</h1><p class="page-subtitle">Your price tracking insights</p></div>
    <div class="stats-grid-3">
      <div class="stat-card glass-card"><div class="stat-number">${data.total_entries}</div><div class="stat-label">Total Entries</div></div>
      <div class="stat-card glass-card"><div class="stat-number">${data.total_products_tracked}</div><div class="stat-label">Products Tracked</div></div>
      <div class="stat-card glass-card"><div class="stat-number">${formatCurrency(data.total_spending)}</div><div class="stat-label">Total Spending</div></div>
    </div>
    <div class="analytics-grid">
      <div class="glass-card"><h3>📊 Category Breakdown</h3>
        <div class="pie-chart-legend">${data.category_breakdown.map(cat => {
          const total = data.category_breakdown.reduce((s, c) => s + c.count, 0);
          const pct = total > 0 ? Math.round(cat.count / total * 100) : 0;
          return `<div class="pie-item"><span class="pie-dot" style="background:hsl(${Math.random()*360},70%,50%)"></span><span>${cat.icon} ${cat.name}</span><span>${pct}% (${cat.count})</span></div>`;
        }).join('')}</div>
      </div>
      <div class="glass-card"><h3>🏪 Top Stores</h3>
        ${data.top_stores.map(s => `
          <div class="store-analytics-row"><span class="fw-medium">${s.store}</span><span>Score: ${s.avg_score}/100</span><span class="text-muted">${s.count} entries</span></div>
        `).join('') || '<p class="empty-sm">No store data yet.</p>'}
      </div>
      <div class="glass-card span-2"><h3>📈 Monthly Trends</h3>
        <div class="monthly-chart">${data.monthly_trends.map(m => {
          const maxC = Math.max(...data.monthly_trends.map(x => x.count), 1);
          const height = (m.count / maxC * 80) + 10;
          return `<div class="month-bar-wrap"><div class="month-bar" style="height:${height}%"><span>${m.count}</span></div><small>${m.month.slice(-2)}</small></div>`;
        }).join('')}</div>
      </div>
    </div>`;
}

// ==================== DEALS ====================
async function renderDeals(c) {
  const deals = await request('/prices/deals');
  c.innerHTML = `
    <div class="page-header"><h1>🏷️ Best Deals</h1><p class="page-subtitle">Top-rated prices from the community</p></div>
    <div class="deals-grid">${deals?.length > 0 ? deals.map(d => `
      <div class="deal-card glass-card">
        <div class="deal-score-badge">${d.ai_score}/100</div>
        <div class="deal-top"><span>${d.icon || '📦'}</span><div><strong>${d.product_name}</strong><span class="text-muted">${d.category}</span></div></div>
        <div class="deal-price-big">${formatCurrency(d.price)}</div>
        <div class="deal-meta"><span>${d.store_name || ''}</span>${d.city ? `<span>📍 ${d.city}</span>` : ''}<span class="text-muted">${timeAgo(d.created_at)}</span></div>
        <span class="deal-contributor">by ${d.contributor}</span>
        ${d.is_sale ? '<span class="sale-badge">SALE</span>' : ''}
      </div>
    `).join('') : '<p class="empty-state">No deals found. Start adding prices!</p>'}</div>`;
}

// ==================== COMMUNITY ====================
async function renderCommunity(c) {
  const [stats, leaders] = await Promise.all([request('/community/stats'), request('/community/leaderboard')]);
  c.innerHTML = `
    <div class="page-header"><h1>👥 Community</h1><p class="page-subtitle">Join thousands saving money together</p></div>
    <div class="stats-grid-4">
      <div class="stat-card glass-card"><div class="stat-number">${stats?.total_users || 0}</div><div class="stat-label">Members</div></div>
      <div class="stat-card glass-card"><div class="stat-number">${stats?.total_prices || 0}</div><div class="stat-label">Prices Shared</div></div>
      <div class="stat-card glass-card"><div class="stat-number">${stats?.total_products || 0}</div><div class="stat-label">Products</div></div>
      <div class="stat-card glass-card"><div class="stat-number">${stats?.weekly_prices || 0}</div><div class="stat-label">This Week</div></div>
    </div>
    ${stats?.top_categories?.length > 0 ? `<div class="glass-card mt-16"><h3>🏆 Top Categories</h3><div class="top-cats">${stats.top_categories.map(c => `<span class="top-cat-chip">${c.name}: ${c.count}</span>`).join('')}</div></div>` : ''}
    <div class="section mt-24"><h2>🏆 Top Contributors</h2>
    <div class="leaderboard">${leaders?.map((l, i) => `
      <div class="leader-row ${i < 3 ? 'top-' + (i + 1) : ''} glass-card">
        <span class="rank">${i < 3 ? ['🥇','🥈','🥉'][i] : '#' + (i + 1)}</span>
        <div class="leader-avatar" style="background:${l.avatar_color || '#3b82f6'}">${(l.name || '?')[0].toUpperCase()}</div>
        <div class="leader-info"><strong>${l.name}</strong><span class="text-muted">${l.city || 'Remote'}</span></div>
        <div class="leader-stats"><span>${l.contributions} prices</span><span class="text-muted">⭐ ${l.reputation} rep</span></div>
      </div>
    `).join('') || '<p class="empty-sm">No contributors yet.</p>'}</div></div>`;
}

// ==================== PROFILE ====================
async function renderProfile(c) {
  const user = await request('/auth/me');
  if (!user) return;
  c.innerHTML = `
    <div class="page-header"><h1>👤 Profile</h1></div>
    <div class="profile-card glass-card">
      <div class="profile-header"><div class="profile-avatar" style="background:${user.avatar_color || '#3b82f6'}">${(user.name || '?')[0].toUpperCase()}</div>
        <div><h2>${user.name}</h2><p class="text-muted">${user.email}</p><p class="text-muted">📍 ${user.city || 'Not set'}${user.country ? ', ' + user.country : ''}</p></div>
      </div>
      <div class="profile-stats-grid">
        <div class="pstat"><span class="pstat-value">${user.total_contributions || 0}</span><span class="pstat-label">Contributions</span></div>
        <div class="pstat"><span class="pstat-value">⭐ ${user.reputation || 0}</span><span class="pstat-label">Reputation</span></div>
        <div class="pstat"><span class="pstat-value">${user.currency || 'USD'}</span><span class="pstat-label">Currency</span></div>
        <div class="pstat"><span class="pstat-value">${formatDate(user.joined_at || user.created_at)}</span><span class="pstat-label">Member Since</span></div>
      </div>
    </div>
    <div class="glass-card mt-16"><h3>Edit Profile</h3>
      <form id="profile-form">
        <div class="input-row"><div class="form-group"><label>Name</label><input type="text" id="pf-name" value="${user.name || ''}" /></div><div class="form-group"><label>City</label><input type="text" id="pf-city" value="${user.city || ''}" /></div></div>
        <div class="input-row"><div class="form-group"><label>Country</label><input type="text" id="pf-country" value="${user.country || ''}" /></div><div class="form-group"><label>Currency</label><select id="pf-currency">${['USD','EUR','GBP','INR','JPY','CAD','AUD'].map(c => `<option ${c === user.currency ? 'selected' : ''}>${c}</option>`).join('')}</select></div></div>
        <button type="submit" class="btn-primary">Save Changes</button>
      </form>
    </div>`;

  $('profile-form').onsubmit = async (e) => {
    e.preventDefault();
    await request('/auth/profile', { method: 'PATCH', body: JSON.stringify({ name: $('pf-name').value, city: $('pf-city').value, country: $('pf-country').value, currency: $('pf-currency').value }) });
    showToast('Profile updated!');
  };
}

// ==================== SETTINGS ====================
async function renderSettings(c) {
  c.innerHTML = `
    <div class="page-header"><h1>⚙️ Settings</h1></div>
    <div class="settings-sections">
      <div class="glass-card"><h3>🎨 Appearance</h3>
        <div class="setting-row"><span>Theme</span><select id="theme-select" onchange="toggleTheme(this.value)"><option value="dark">Dark Mode</option><option value="light">Light Mode</option></select></div>
      </div>
      <div class="glass-card"><h3>📤 Data Export</h3>
        <p class="text-muted">Download your data as JSON files.</p>
        <div class="btn-group mt-8"><button class="btn-outline" onclick="exportData('prices')">📊 Export Prices</button><button class="btn-outline" onclick="exportData('spending')">📈 Export Spending</button></div>
      </div>
      <div class="glass-card"><h3>⌨️ Keyboard Shortcuts</h3>
        <div class="shortcuts-list">
          <div class="shortcut-row"><kbd>D</kbd><span>Dashboard</span></div>
          <div class="shortcut-row"><kbd>A</kbd><span>Add Price</span></div>
          <div class="shortcut-row"><kbd>S</kbd><span>Search</span></div>
          <div class="shortcut-row"><kbd>E</kbd><span>Spending</span></div>
          <div class="shortcut-row"><kbd>?</kbd><span>Show Shortcuts</span></div>
        </div>
      </div>
      <div class="glass-card"><h3>💬 Feedback</h3>
        <form id="feedback-form">
          <select id="fb-type"><option value="bug">🐛 Bug Report</option><option value="feature">💡 Feature Request</option><option value="general">💬 General Feedback</option></select>
          <textarea id="fb-message" placeholder="Your message..." rows="3" required></textarea>
          <button type="submit" class="btn-primary">Send Feedback</button>
        </form>
      </div>
      <div class="glass-card"><h3>ℹ️ About</h3>
        <p><strong>PriceMind</strong> v2.0</p><p class="text-muted">AI-Powered Price Intelligence Platform</p>
        <p class="text-muted mt-8">Track prices, manage spending, get AI insights, and save money with the community.</p>
      </div>
    </div>`;

  $('feedback-form').onsubmit = async (e) => {
    e.preventDefault();
    await request('/feedback', { method: 'POST', body: JSON.stringify({ type: $('fb-type').value, message: $('fb-message').value }) });
    showToast('Thanks for your feedback!'); e.target.reset();
  };
}

async function exportData(type) {
  const data = await request(`/export/${type}`);
  if (data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `pricemind_${type}_${new Date().toISOString().split('T')[0]}.json`; a.click();
    showToast(`${type} data exported!`);
  }
}

function toggleTheme(theme) { document.body.classList.toggle('light-theme', theme === 'light'); localStorage.setItem('pricemind_theme', theme); }

// ==================== KEYBOARD SHORTCUTS ====================
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
  if (!isLoggedIn()) return;
  const keyMap = { d: 'dashboard', a: 'add-price', s: 'search', e: 'spending', b: 'budgets', w: 'watchlist', p: 'profile' };
  if (keyMap[e.key]) { e.preventDefault(); navigateTo(keyMap[e.key]); }
});

// ==================== STYLES ====================
const style = document.createElement('style');
style.textContent = `
:root { --bg: #0f172a; --bg-card: #1e293b; --bg-card-hover: #253449; --bg-input: #0f172a; --text: #e2e8f0; --text-muted: #94a3b8; --text-dim: #64748b; --border: #334155; --primary: #3b82f6; --primary-hover: #2563eb; --primary-light: #3b82f620; --success: #22c55e; --warning: #f59e0b; --danger: #ef4444; --purple: #8b5cf6; --radius: 12px; --radius-sm: 8px; --shadow: 0 4px 24px rgba(0,0,0,0.3); --glass: rgba(30,41,59,0.8); }
body.light-theme { --bg: #f1f5f9; --bg-card: #ffffff; --bg-card-hover: #f8fafc; --bg-input: #f1f5f9; --text: #1e293b; --text-muted: #64748b; --text-dim: #94a3b8; --border: #e2e8f0; --glass: rgba(255,255,255,0.8); --shadow: 0 4px 24px rgba(0,0,0,0.08); }
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: var(--bg); color: var(--text); line-height: 1.5; }
::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-track { background: transparent; } ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }

/* Auth */
.auth-container { display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; position: relative; overflow: hidden; }
.auth-bg-shapes { position: absolute; inset: 0; z-index: 0; }
.shape { position: absolute; border-radius: 50%; filter: blur(80px); opacity: 0.15; animation: float 20s infinite; }
.shape-1 { width: 400px; height: 400px; background: var(--primary); top: -100px; right: -100px; }
.shape-2 { width: 300px; height: 300px; background: var(--purple); bottom: -50px; left: -50px; animation-delay: 7s; }
.shape-3 { width: 200px; height: 200px; background: var(--success); top: 50%; left: 50%; animation-delay: 14s; }
@keyframes float { 0%,100% { transform: translate(0,0) scale(1); } 33% { transform: translate(30px,-30px) scale(1.1); } 66% { transform: translate(-20px,20px) scale(0.9); } }
.auth-card { background: var(--glass); backdrop-filter: blur(20px); border: 1px solid var(--border); border-radius: 20px; padding: 40px; width: 100%; max-width: 440px; position: relative; z-index: 1; }
.auth-logo { text-align: center; margin-bottom: 24px; }
.logo-icon { font-size: 3rem; margin-bottom: 8px; }
.auth-logo h1 { font-size: 2rem; background: linear-gradient(135deg, var(--primary), var(--purple)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
.subtitle { color: var(--text-muted); font-size: 14px; }
.tabs { display: flex; gap: 4px; background: var(--bg-input); border-radius: var(--radius-sm); padding: 4px; margin-bottom: 20px; }
.tab { flex: 1; padding: 10px; background: transparent; border: none; color: var(--text-muted); border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500; transition: all 0.2s; }
.tab.active { background: var(--primary); color: white; }
form { display: flex; flex-direction: column; gap: 12px; }
.input-group { position: relative; display: flex; align-items: center; }
.input-icon { position: absolute; left: 12px; z-index: 1; font-size: 16px; }
.input-group input { padding-left: 40px; }
input, select, textarea { width: 100%; padding: 12px 16px; background: var(--bg-input); border: 1px solid var(--border); border-radius: var(--radius-sm); color: var(--text); font-size: 14px; transition: border-color 0.2s, box-shadow 0.2s; outline: none; }
input:focus, select:focus, textarea:focus { border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-light); }
.input-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.input-row-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }
.input-with-prefix { position: relative; display: flex; align-items: center; }
.input-with-prefix .prefix { position: absolute; left: 12px; color: var(--text-muted); font-weight: 600; z-index: 1; }
.input-with-prefix input { padding-left: 30px; }
.btn-primary { padding: 12px 24px; background: var(--primary); color: white; border: none; border-radius: var(--radius-sm); cursor: pointer; font-size: 14px; font-weight: 600; transition: all 0.2s; }
.btn-primary:hover { background: var(--primary-hover); transform: translateY(-1px); }
.btn-primary:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
.btn-glow { box-shadow: 0 4px 15px var(--primary-light); }
.btn-outline { padding: 10px 20px; background: transparent; border: 1px solid var(--border); color: var(--text); border-radius: var(--radius-sm); cursor: pointer; transition: all 0.2s; }
.btn-outline:hover { border-color: var(--primary); color: var(--primary); }
.btn-sm { padding: 6px 14px; font-size: 12px; border-radius: 6px; }
.btn-lg { padding: 16px; font-size: 16px; }
.btn-danger { padding: 6px 14px; background: var(--danger); color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 12px; }
.btn-icon-sm { background: none; border: none; cursor: pointer; font-size: 16px; padding: 4px; opacity: 0.5; transition: opacity 0.2s; }
.btn-icon-sm:hover { opacity: 1; }
.btn-logout { width: 100%; padding: 10px; background: transparent; border: 1px solid var(--border); color: var(--text-muted); border-radius: var(--radius-sm); cursor: pointer; font-size: 13px; transition: all 0.2s; }
.btn-logout:hover { border-color: var(--danger); color: var(--danger); }
.btn-group { display: flex; gap: 8px; flex-wrap: wrap; }
.error { color: var(--danger); text-align: center; margin-top: 12px; font-size: 14px; }
.auth-features { display: flex; justify-content: center; gap: 12px; margin-top: 24px; flex-wrap: wrap; }
.auth-feature { display: flex; align-items: center; gap: 6px; padding: 6px 12px; background: var(--primary-light); border-radius: 20px; font-size: 12px; color: var(--text-muted); }

/* Shell */
.app-shell { display: flex; min-height: 100vh; }
.sidebar { width: 260px; background: var(--bg-card); padding: 0; display: flex; flex-direction: column; position: fixed; height: 100vh; border-right: 1px solid var(--border); transition: width 0.3s; z-index: 50; overflow-y: auto; }
.sidebar.collapsed { width: 70px; }
.sidebar.collapsed .nav-text, .sidebar.collapsed .nav-section, .sidebar.collapsed .logo h2, .sidebar.collapsed .btn-logout { display: none; }
.sidebar.collapsed .nav-badge { display: none !important; }
.sidebar-header { display: flex; align-items: center; justify-content: space-between; padding: 20px 16px; border-bottom: 1px solid var(--border); }
.logo { display: flex; align-items: center; gap: 10px; }
.logo-icon-sm { font-size: 1.5rem; }
.logo h2 { font-size: 1.1rem; white-space: nowrap; }
.sidebar-toggle { background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 18px; padding: 4px; }
.nav-list { list-style: none; flex: 1; padding: 8px; overflow-y: auto; }
.nav-section { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: var(--text-dim); padding: 16px 16px 6px; font-weight: 600; }
.nav-link { display: flex; align-items: center; gap: 12px; padding: 10px 16px; color: var(--text-muted); text-decoration: none; border-radius: var(--radius-sm); transition: all 0.15s; font-size: 14px; position: relative; }
.nav-link:hover { background: var(--bg-card-hover); color: var(--text); }
.nav-link.active { background: var(--primary-light); color: var(--primary); font-weight: 500; }
.nav-icon { font-size: 18px; width: 24px; text-align: center; flex-shrink: 0; }
.nav-text { white-space: nowrap; }
.nav-badge { position: absolute; right: 12px; background: var(--danger); color: white; font-size: 10px; padding: 2px 6px; border-radius: 10px; font-weight: 600; }
.nav-footer { padding: 16px; border-top: 1px solid var(--border); }
.content { flex: 1; margin-left: 260px; padding: 32px; max-width: 1100px; transition: margin-left 0.3s; }
.sidebar.collapsed ~ .content { margin-left: 70px; }
.mobile-nav { display: none; position: fixed; bottom: 0; left: 0; right: 0; background: var(--bg-card); padding: 8px 0; justify-content: space-around; border-top: 1px solid var(--border); z-index: 100; }
.mobile-link { display: flex; flex-direction: column; align-items: center; gap: 2px; text-decoration: none; color: var(--text-muted); font-size: 20px; padding: 4px 8px; }
.mobile-link small { font-size: 10px; }
.mobile-link.active { color: var(--primary); }

/* Page */
.page-header { margin-bottom: 24px; }
.page-header h1 { font-size: 1.8rem; font-weight: 700; }
.page-subtitle { color: var(--text-muted); font-size: 14px; margin-top: 4px; }
.page-loading { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px; gap: 12px; color: var(--text-muted); }
.spinner { width: 32px; height: 32px; border: 3px solid var(--border); border-top-color: var(--primary); border-radius: 50%; animation: spin 0.8s linear infinite; }
.spinner-sm { display: inline-block; width: 16px; height: 16px; border: 2px solid rgba(255,255,255,0.3); border-top-color: white; border-radius: 50%; animation: spin 0.8s linear infinite; vertical-align: middle; margin-right: 8px; }
@keyframes spin { to { transform: rotate(360deg); } }
.page-enter { animation: fadeIn 0.3s ease; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
.animate-in { animation: slideUp 0.4s ease; }
@keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }

/* Cards */
.glass-card { background: var(--glass); backdrop-filter: blur(10px); border: 1px solid var(--border); border-radius: var(--radius); padding: 24px; }
.glass-card h3 { font-size: 1rem; margin-bottom: 16px; }

/* Stats */
.stats-grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px; }
.stats-grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 24px; }
.stat-card { border-radius: var(--radius); padding: 20px; text-align: center; position: relative; overflow: hidden; }
.stat-card.gradient-blue { background: linear-gradient(135deg, #1e3a5f, #1e293b); border: 1px solid #3b82f630; }
.stat-card.gradient-green { background: linear-gradient(135deg, #14532d40, #1e293b); border: 1px solid #22c55e30; }
.stat-card.gradient-purple { background: linear-gradient(135deg, #3b0764, #1e293b); border: 1px solid #8b5cf630; }
.stat-card.gradient-amber { background: linear-gradient(135deg, #78350f40, #1e293b); border: 1px solid #f59e0b30; }
.stat-icon { font-size: 1.3rem; margin-bottom: 8px; }
.stat-number { font-size: 1.6rem; font-weight: 700; color: var(--primary); }
.stat-label { color: var(--text-muted); font-size: 12px; margin-top: 4px; }

/* Alert Banner */
.alert-banner { display: flex; align-items: center; gap: 12px; padding: 14px 20px; border-radius: var(--radius); margin-bottom: 16px; }
.alert-banner.success { background: #22c55e15; border: 1px solid #22c55e40; }
.alert-banner.info { background: var(--primary-light); border: 1px solid var(--primary); }
.alert-banner.warning { background: #f59e0b15; border: 1px solid #f59e0b40; color: var(--warning); }
.alert-banner-icon { font-size: 1.3rem; }

/* Dashboard Grid */
.dashboard-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.dash-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px; }
.dash-card.span-2 { grid-column: span 2; }
.dash-card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.dash-card-header h3 { font-size: 0.95rem; }
.link-sm { font-size: 12px; color: var(--primary); text-decoration: none; }
.link-sm:hover { text-decoration: underline; }

/* Quick Form */
.quick-form { display: flex; flex-direction: column; gap: 8px; }
.compact-form { padding: 16px; }

/* Budget Mini */
.budget-mini { margin-bottom: 12px; }
.budget-mini-header { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 4px; }
.budget-mini-footer { display: flex; justify-content: space-between; font-size: 11px; color: var(--text-muted); margin-top: 4px; }
.progress-bar { height: 6px; background: var(--border); border-radius: 3px; overflow: hidden; }
.progress-bar.lg { height: 10px; border-radius: 5px; }
.progress-fill { height: 100%; background: var(--primary); border-radius: 3px; transition: width 0.5s ease; }
.progress-fill.warning { background: var(--warning); }
.progress-fill.danger { background: var(--danger); }

/* Table */
.table-modern { overflow-x: auto; }
.table-modern table { width: 100%; border-collapse: collapse; }
.table-modern thead th { text-align: left; padding: 10px 12px; color: var(--text-muted); font-size: 12px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid var(--border); }
.table-modern tbody td { padding: 10px 12px; font-size: 13px; border-bottom: 1px solid var(--border); }
.table-row-hover:hover { background: var(--bg-card-hover); }
.price-cell { color: var(--success); font-weight: 600; }
.fw-medium { font-weight: 500; }
.text-muted { color: var(--text-muted); }
.text-success { color: var(--success); }
.text-warning { color: var(--warning); }
.text-danger { color: var(--danger); }
.mt-8 { margin-top: 8px; }
.mt-16 { margin-top: 16px; }
.mt-24 { margin-top: 24px; }

/* Rating Badge */
.rating-badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 700; text-transform: uppercase; }
.rating-badge.cheap { background: #22c55e20; color: var(--success); }
.rating-badge.fair { background: #3b82f620; color: var(--primary); }
.rating-badge.average { background: #f59e0b20; color: var(--warning); }
.rating-badge.expensive { background: #ef444420; color: var(--danger); }
.rating-badge.overpriced { background: #dc262620; color: #dc2626; }

/* Deal Mini */
.deal-mini { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--border); }
.deal-icon { font-size: 1.3rem; }
.deal-info { flex: 1; }
.deal-info strong { display: block; font-size: 13px; }
.deal-info span { font-size: 11px; color: var(--text-muted); }
.deal-price { color: var(--success); font-weight: 600; font-size: 14px; }

/* Bill Mini */
.bill-mini { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--border); }
.bill-icon { font-size: 1.2rem; }
.bill-info { flex: 1; }
.bill-info strong { display: block; font-size: 13px; }
.bill-info span { font-size: 11px; color: var(--text-muted); }
.bill-amount { font-weight: 600; font-size: 14px; }

/* Empty States */
.empty-state { text-align: center; padding: 40px; color: var(--text-dim); font-size: 14px; }
.empty-sm { text-align: center; padding: 16px; color: var(--text-dim); font-size: 13px; }
.empty-sm a { color: var(--primary); text-decoration: none; }

/* Form */
.form-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); padding: 24px; }
.form-section { margin-bottom: 20px; padding-bottom: 20px; border-bottom: 1px solid var(--border); }
.form-section h3 { font-size: 0.9rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px; }
.form-group { margin-bottom: 12px; }
.form-group label { display: block; margin-bottom: 6px; color: var(--text-muted); font-size: 13px; font-weight: 500; }
.form-hint { font-size: 11px; color: var(--text-dim); margin-top: 4px; }
.required { color: var(--danger); }
.checkbox-label { display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 14px; color: var(--text); }
.inline-form { flex-direction: row; flex-wrap: wrap; align-items: flex-end; gap: 8px; }
.inline-form input, .inline-form select { min-width: 120px; flex: 1; }

/* Sections */
.section { margin-top: 24px; }
.section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.section-header h2 { font-size: 1.1rem; }

/* Search */
.search-panel { margin-bottom: 24px; }
.search-main { display: flex; gap: 12px; margin-bottom: 12px; }
.search-input-lg { font-size: 16px; padding: 14px 20px; flex: 1; }
.search-filters { display: flex; gap: 8px; flex-wrap: wrap; }
.search-filters select, .search-filters input { font-size: 13px; padding: 8px 12px; min-width: 100px; }
.price-range { display: flex; align-items: center; gap: 4px; }
.price-range input { width: 80px; }
.results-header { padding: 8px 0; font-size: 13px; color: var(--text-muted); }
.results-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px; }
.result-card { cursor: pointer; transition: all 0.2s; }
.result-card:hover { border-color: var(--primary); transform: translateY(-2px); }
.result-top { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.result-icon { font-size: 1.5rem; }
.result-prices-row { display: flex; align-items: baseline; gap: 16px; margin-bottom: 8px; }
.result-price-main { font-size: 1.3rem; font-weight: 700; color: var(--success); }
.result-price-stats { display: flex; flex-direction: column; font-size: 12px; color: var(--text-muted); }
.result-meta { display: flex; gap: 12px; font-size: 12px; color: var(--text-dim); margin-bottom: 8px; }
.result-actions { display: flex; gap: 8px; }

/* Trending */
.trending-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
.trending-card { display: flex; align-items: center; gap: 16px; padding: 16px; background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-sm); cursor: pointer; transition: all 0.2s; }
.trending-card:hover { border-color: var(--primary); background: var(--bg-card-hover); }
.trending-icon { font-size: 1.5rem; }
.trending-info { flex: 1; }
.trending-info strong { display: block; font-size: 14px; }
.trending-prices { text-align: right; }
.price-main { display: block; font-weight: 700; color: var(--success); }
.price-range-sm { font-size: 11px; color: var(--text-muted); }

/* Analysis */
.analysis-grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 16px; }
.analysis-grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 16px; }
.analysis-item { text-align: center; }
.analysis-item span { display: block; font-size: 12px; color: var(--text-muted); margin-top: 4px; }
.analysis-badge { display: inline-block; padding: 6px 16px; border-radius: 20px; color: white; font-weight: 700; font-size: 13px; }
.analysis-score { font-size: 1.5rem; font-weight: 700; color: var(--primary); }
.analysis-score small { font-size: 0.7rem; color: var(--text-muted); }
.analysis-range { font-size: 0.85rem; font-weight: 600; }
.trend-icon { font-size: 1.8rem; }
.insight-cards { display: flex; flex-direction: column; gap: 8px; }
.insight { display: flex; gap: 12px; align-items: flex-start; padding: 12px; background: var(--bg); border-radius: var(--radius-sm); }
.insight-icon { font-size: 1.2rem; flex-shrink: 0; }
.insight p { font-size: 14px; }

/* Product Detail Modal */
.product-detail { max-height: 70vh; overflow-y: auto; }
.product-stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px; }
.pstat { text-align: center; padding: 12px; background: var(--bg); border-radius: var(--radius-sm); }
.pstat-label { display: block; font-size: 11px; color: var(--text-muted); }
.pstat-value { display: block; font-weight: 700; font-size: 1.1rem; margin-bottom: 4px; }
.store-comparison { display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; }
.store-row { display: flex; align-items: center; gap: 12px; padding: 10px; border-radius: 6px; }
.store-row.best-deal { background: #22c55e10; }
.store-name { flex: 1; font-weight: 500; }
.store-price { font-weight: 700; }
.price-chart { display: flex; align-items: flex-end; gap: 4px; height: 120px; margin-bottom: 16px; }
.chart-bar-wrap { flex: 1; display: flex; flex-direction: column; align-items: center; height: 100%; justify-content: flex-end; }
.chart-bar { width: 100%; background: var(--primary); border-radius: 3px 3px 0 0; min-height: 4px; transition: height 0.3s; }
.chart-bar-wrap small { font-size: 8px; color: var(--text-dim); margin-top: 4px; white-space: nowrap; }
.price-history-list { display: flex; flex-direction: column; }
.ph-row { display: flex; gap: 16px; padding: 8px 0; border-bottom: 1px solid var(--border); font-size: 13px; }

/* Spending */
.spending-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.spending-total { display: flex; flex-direction: column; }
.total-label { font-size: 12px; color: var(--text-muted); text-transform: uppercase; }
.total-amount { font-size: 2rem; font-weight: 700; color: var(--primary); }
.spending-avg { color: var(--text-muted); font-size: 13px; }
.spending-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.period-tabs { display: flex; gap: 4px; background: var(--bg-card); border-radius: var(--radius-sm); padding: 4px; margin-bottom: 20px; width: fit-content; }
.period-tab { padding: 8px 20px; background: transparent; border: none; color: var(--text-muted); border-radius: 6px; cursor: pointer; font-size: 13px; transition: all 0.2s; }
.period-tab.active { background: var(--primary); color: white; }
.category-bars { display: flex; flex-direction: column; gap: 10px; }
.cat-bar { display: flex; align-items: center; gap: 8px; }
.cat-label { width: 100px; font-size: 13px; }
.bar { flex: 1; height: 20px; background: var(--bg); border-radius: 10px; overflow: hidden; }
.bar-fill { height: 100%; background: linear-gradient(90deg, var(--primary), var(--purple)); border-radius: 10px; transition: width 0.5s; }
.cat-amount { width: 80px; text-align: right; font-weight: 600; font-size: 13px; }
.cat-pct { width: 40px; text-align: right; font-size: 12px; color: var(--text-muted); }
.daily-chart { display: flex; align-items: flex-end; gap: 4px; height: 100px; }
.daily-bar-wrap { flex: 1; display: flex; flex-direction: column; align-items: center; height: 100%; justify-content: flex-end; }
.daily-bar { width: 100%; background: linear-gradient(0deg, var(--primary), var(--purple)); border-radius: 3px 3px 0 0; min-height: 2px; }
.daily-bar-wrap small { font-size: 9px; color: var(--text-dim); margin-top: 4px; }
.transactions-list { display: flex; flex-direction: column; }
.transaction-row { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--border); }
.transaction-cat { font-size: 11px; color: var(--text-muted); background: var(--bg); padding: 3px 8px; border-radius: 4px; }
.transaction-info { flex: 1; display: flex; flex-direction: column; }
.transaction-info span:first-child { font-size: 13px; }
.transaction-info span:last-child { font-size: 11px; }
.transaction-amount { font-weight: 600; color: var(--danger); }

/* Insights */
.insights-card .insight-header { display: flex; align-items: center; gap: 16px; margin-bottom: 16px; }
.grade-badge { width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; border-radius: 12px; font-size: 1.5rem; font-weight: 700; color: white; }
.grade-a { background: var(--success); } .grade-b { background: #3b82f6; } .grade-c { background: var(--warning); } .grade-d { background: var(--danger); } .grade-f { background: #dc2626; }
.insight-summary { font-size: 14px; line-height: 1.6; margin-bottom: 16px; }
.insight-sections { display: flex; flex-direction: column; gap: 12px; }
.insight-section { padding: 12px; background: var(--bg); border-radius: var(--radius-sm); }
.insight-section h4 { margin-bottom: 8px; font-size: 14px; }
.insight-section ul { padding-left: 20px; margin: 0; }
.insight-section li { margin-bottom: 4px; font-size: 13px; }
.warning-section { border-left: 3px solid var(--warning); }
.success-section { border-left: 3px solid var(--success); }

/* Budgets */
.budgets-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 16px; }
.budget-card { text-align: center; }
.budget-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.budget-circle { width: 100px; margin: 0 auto 12px; }
.budget-circle svg { width: 100%; }
.budget-details { display: flex; flex-direction: column; gap: 4px; font-size: 13px; }

/* Savings */
.savings-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(350px, 1fr)); gap: 16px; }
.savings-card { }
.savings-header { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
.savings-icon { font-size: 2rem; }
.savings-header div { flex: 1; }
.savings-progress { margin-bottom: 12px; }
.savings-amounts { display: flex; justify-content: space-between; font-size: 12px; color: var(--text-muted); margin-top: 4px; }
.savings-pct { text-align: center; font-size: 1.2rem; font-weight: 700; color: var(--primary); margin-top: 4px; }
.deposit-form { display: flex; gap: 8px; align-items: center; }

/* Bills */
.bills-list { display: flex; flex-direction: column; gap: 8px; }
.bill-card { display: flex; align-items: center; gap: 16px; }
.bill-card.overdue { border-color: var(--danger); }
.bill-card.paid { opacity: 0.6; }
.bill-left { display: flex; align-items: center; gap: 12px; flex: 1; }
.bill-right { display: flex; align-items: center; gap: 12px; }
.bill-freq-badge { font-size: 10px; padding: 2px 8px; background: var(--primary-light); color: var(--primary); border-radius: 4px; text-transform: uppercase; }
.badge-success { color: var(--success); font-size: 13px; font-weight: 600; }

/* Alerts */
.alerts-grid { display: flex; flex-direction: column; gap: 8px; }
.alert-card { display: flex; align-items: center; gap: 16px; }
.alert-card.triggered { border-color: var(--success); }
.alert-card.snoozed { opacity: 0.6; }
.alert-status-icon { font-size: 1.5rem; }
.alert-content { flex: 1; display: flex; flex-direction: column; }
.alert-content strong { font-size: 14px; }
.alert-actions { display: flex; gap: 8px; }

/* Watchlist */
.watchlist-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 12px; }
.watchlist-card { cursor: pointer; transition: all 0.2s; }
.watchlist-card:hover { border-color: var(--primary); }
.wl-header { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
.wl-icon { font-size: 1.5rem; }
.wl-header div { flex: 1; }
.wl-prices { display: flex; justify-content: space-between; }
.wl-current { font-size: 1.2rem; font-weight: 700; color: var(--success); }

/* Analytics */
.analytics-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.analytics-grid .span-2 { grid-column: span 2; }
.pie-chart-legend { display: flex; flex-direction: column; gap: 8px; }
.pie-item { display: flex; align-items: center; gap: 8px; font-size: 13px; }
.pie-dot { width: 12px; height: 12px; border-radius: 50%; }
.pie-item span:last-child { margin-left: auto; color: var(--text-muted); }
.store-analytics-row { display: flex; align-items: center; gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--border); font-size: 13px; }
.monthly-chart { display: flex; align-items: flex-end; gap: 8px; height: 140px; }
.month-bar-wrap { flex: 1; display: flex; flex-direction: column; align-items: center; height: 100%; justify-content: flex-end; }
.month-bar { width: 100%; background: linear-gradient(0deg, var(--primary), var(--purple)); border-radius: 4px 4px 0 0; min-height: 4px; display: flex; align-items: flex-start; justify-content: center; }
.month-bar span { font-size: 10px; color: white; padding-top: 4px; }
.month-bar-wrap small { font-size: 10px; color: var(--text-dim); margin-top: 4px; }

/* Deals */
.deals-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 16px; }
.deal-card { position: relative; transition: all 0.2s; }
.deal-card:hover { transform: translateY(-2px); border-color: var(--success); }
.deal-score-badge { position: absolute; top: 12px; right: 12px; background: var(--success); color: white; padding: 4px 10px; border-radius: 12px; font-size: 12px; font-weight: 700; }
.deal-top { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.deal-top span { font-size: 1.5rem; }
.deal-price-big { font-size: 1.3rem; font-weight: 700; color: var(--success); margin-bottom: 8px; }
.deal-meta { display: flex; gap: 8px; font-size: 12px; color: var(--text-muted); margin-bottom: 4px; }
.deal-contributor { font-size: 11px; color: var(--text-dim); }
.sale-badge { display: inline-block; padding: 2px 8px; background: var(--danger); color: white; border-radius: 4px; font-size: 10px; font-weight: 700; margin-top: 8px; }

/* Community */
.top-cats { display: flex; flex-wrap: wrap; gap: 8px; }
.top-cat-chip { padding: 6px 12px; background: var(--bg); border-radius: 20px; font-size: 13px; }
.leaderboard { display: flex; flex-direction: column; gap: 8px; }
.leader-row { display: flex; align-items: center; gap: 16px; padding: 12px 16px; }
.leader-row.top-1 { border-color: #fbbf24; background: linear-gradient(135deg, var(--bg-card), #3d2e0a20); }
.leader-row.top-2 { border-color: #94a3b8; }
.leader-row.top-3 { border-color: #cd7f32; }
.rank { font-size: 1.3rem; width: 36px; text-align: center; }
.leader-avatar { width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: 700; font-size: 1.1rem; }
.leader-info { flex: 1; }
.leader-info strong { display: block; font-size: 14px; }
.leader-stats { text-align: right; font-size: 13px; }
.leader-stats span { display: block; }

/* Profile */
.profile-card { display: flex; flex-direction: column; align-items: center; }
.profile-header { display: flex; align-items: center; gap: 20px; margin-bottom: 24px; text-align: left; width: 100%; }
.profile-avatar { width: 64px; height: 64px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-size: 1.8rem; font-weight: 700; flex-shrink: 0; }
.profile-stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; width: 100%; }

/* Settings */
.settings-sections { display: flex; flex-direction: column; gap: 16px; }
.setting-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; }
.setting-row select { width: 180px; }
.shortcuts-list { display: flex; flex-direction: column; gap: 8px; }
.shortcut-row { display: flex; align-items: center; gap: 16px; font-size: 13px; }
kbd { padding: 4px 10px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; font-family: monospace; font-size: 12px; }

/* Quote */
.quote-card { margin-bottom: 8px; }
.quote-header { display: flex; justify-content: space-between; margin-bottom: 4px; }
.quote-meta { display: flex; gap: 12px; font-size: 13px; align-items: center; }

/* Modal */
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 1000; opacity: 0; transition: opacity 0.2s; padding: 20px; }
.modal-overlay.show { opacity: 1; }
.modal { background: var(--bg-card); border: 1px solid var(--border); border-radius: 16px; width: 100%; max-width: 600px; max-height: 90vh; overflow-y: auto; }
.modal-header { display: flex; justify-content: space-between; align-items: center; padding: 20px 24px; border-bottom: 1px solid var(--border); }
.modal-header h3 { font-size: 1.1rem; }
.modal-close { background: none; border: none; color: var(--text-muted); font-size: 18px; cursor: pointer; padding: 4px; }
.modal-body { padding: 24px; }
.modal-body h4 { margin-top: 16px; margin-bottom: 8px; font-size: 14px; }
.modal-footer { padding: 16px 24px; border-top: 1px solid var(--border); display: flex; gap: 8px; justify-content: flex-end; }

/* Toast */
.toast-container { position: fixed; top: 20px; right: 20px; z-index: 10000; display: flex; flex-direction: column; gap: 8px; }
.toast { display: flex; align-items: center; gap: 10px; padding: 12px 20px; background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-sm); color: var(--text); font-size: 14px; box-shadow: var(--shadow); transform: translateX(100%); opacity: 0; transition: all 0.3s ease; min-width: 250px; }
.toast.show { transform: translateX(0); opacity: 1; }
.toast-success .toast-icon { color: var(--success); }
.toast-error .toast-icon { color: var(--danger); }
.toast-info .toast-icon { color: var(--primary); }

/* Smart budget */
.smart-budgets { display: flex; flex-direction: column; gap: 8px; }
.smart-budget-row { display: flex; align-items: center; gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--border); font-size: 13px; }
.smart-budget-row span:nth-child(3) { flex: 1; }

/* Responsive */
@media (max-width: 1024px) { .stats-grid-4 { grid-template-columns: repeat(2, 1fr); } .dashboard-grid { grid-template-columns: 1fr; } .dash-card.span-2 { grid-column: auto; } .analytics-grid { grid-template-columns: 1fr; } .analytics-grid .span-2 { grid-column: auto; } .spending-grid { grid-template-columns: 1fr; } }
@media (max-width: 768px) {
  .sidebar { display: none; } .content { margin-left: 0 !important; padding: 20px; padding-bottom: 80px; } .mobile-nav { display: flex; }
  .input-row, .input-row-3 { grid-template-columns: 1fr; } .stats-grid-4, .stats-grid-3 { grid-template-columns: 1fr 1fr; }
  .search-main { flex-direction: column; } .search-filters { flex-direction: column; }
  .analysis-grid-4, .analysis-grid-3 { grid-template-columns: repeat(2, 1fr); } .product-stats-grid { grid-template-columns: repeat(2, 1fr); }
  .profile-stats-grid { grid-template-columns: repeat(2, 1fr); }
  .results-grid, .trending-grid, .watchlist-grid, .deals-grid, .budgets-grid, .savings-grid { grid-template-columns: 1fr; }
  .inline-form { flex-direction: column; align-items: stretch; }
}
`;
document.head.appendChild(style);

// Init theme
if (localStorage.getItem('pricemind_theme') === 'light') document.body.classList.add('light-theme');

// Init app
renderApp();
