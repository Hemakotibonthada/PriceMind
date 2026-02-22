const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('./database');
const { authMiddleware, generateToken } = require('./auth');
const { analyzePriceFairness, analyzeServiceQuote, categorizeProduct, generateSpendingInsights, predictPrice, generateSmartBudget } = require('./ai');

const router = express.Router();

// ==================== AUTH ====================
router.post('/auth/register', async (req, res) => {
  try {
    const { email, password, name, city, country, currency } = req.body;
    if (!email || !password || !name) return res.status(400).json({ error: 'Required fields missing' });
    const existing = db.findOne('users', u => u.email === email);
    if (existing) return res.status(409).json({ error: 'Email already exists' });
    const hash = await bcrypt.hash(password, 10);
    const result = db.insert('users', {
      email, password: hash, name, city: city || '', country: country || '',
      currency: currency || 'USD', avatar_color: '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6,'0'),
      theme: 'dark', total_contributions: 0, reputation: 0,
      joined_at: new Date().toISOString(), last_active: new Date().toISOString()
    });
    const token = generateToken(result.lastInsertRowid);
    res.json({ token, user: { id: result.lastInsertRowid, email, name } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = db.findOne('users', u => u.email === email);
    if (!user || !(await bcrypt.compare(password, user.password)))
      return res.status(401).json({ error: 'Invalid credentials' });
    db.update('users', u => u.id === user.id, { last_active: new Date().toISOString() });
    const token = generateToken(user.id);
    const { password: _, ...safe } = user;
    res.json({ token, user: safe });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/auth/me', authMiddleware, (req, res) => {
  const user = db.findOne('users', u => u.id === req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const { password, ...safe } = user;
  res.json(safe);
});

router.patch('/auth/profile', authMiddleware, (req, res) => {
  const { name, city, country, currency, theme } = req.body;
  const updates = {};
  if (name) updates.name = name;
  if (city !== undefined) updates.city = city;
  if (country !== undefined) updates.country = country;
  if (currency) updates.currency = currency;
  if (theme) updates.theme = theme;
  db.update('users', u => u.id === req.userId, updates);
  const user = db.findOne('users', u => u.id === req.userId);
  const { password, ...safe } = user;
  res.json(safe);
});

// ==================== PRICES ====================
router.post('/prices', authMiddleware, async (req, res) => {
  try {
    const { product_name, barcode, price, currency, store_name, city, country, is_sale, notes, photo_url, unit, quantity } = req.body;
    if (!product_name || !price) return res.status(400).json({ error: 'Product name and price required' });

    const categorization = await categorizeProduct(product_name);
    const cat = db.findOne('categories', c => c.name === categorization.category) || db.findOne('categories', c => c.name === 'Groceries');

    let product = db.findOne('products', p => p.name.toLowerCase() === product_name.toLowerCase());
    if (!product) {
      const pResult = db.insert('products', { name: product_name, barcode: barcode || '', category_id: cat?.id || 1, subcategory: categorization.subcategory || '' });
      product = db.findOne('products', p => p.id === pResult.lastInsertRowid);
    }

    const existingPrices = db.findAll('price_entries', pe => pe.product_id === product.id).map(pe => pe.price);
    const analysis = await analyzePriceFairness(product_name, price, existingPrices, categorization.category);

    const entry = db.insert('price_entries', {
      user_id: req.userId, product_id: product.id, price, currency: currency || 'USD',
      store_name: store_name || '', city: city || '', country: country || '',
      is_sale: is_sale ? 1 : 0, notes: notes || '', photo_url: photo_url || '',
      unit: unit || '', quantity: quantity || 1, verified_count: 0,
      ai_score: analysis.score, ai_rating: analysis.rating
    });

    // Update user contribution count
    const user = db.findOne('users', u => u.id === req.userId);
    db.update('users', u => u.id === req.userId, {
      total_contributions: (user.total_contributions || 0) + 1,
      reputation: (user.reputation || 0) + 5
    });

    // Check and trigger alerts
    const alerts = db.findAll('price_alerts', a =>
      a.product_id === product.id && a.is_active === 1 && !a.triggered && price <= a.target_price
    );
    for (const alert of alerts) {
      db.update('price_alerts', a => a.id === alert.id, { triggered: 1, triggered_at: new Date().toISOString() });
      db.insert('notifications', { user_id: alert.user_id, type: 'price_drop', title: `Price Drop: ${product_name}`, message: `Price dropped to $${price.toFixed(2)} (target: $${alert.target_price.toFixed(2)})`, is_read: 0, data: JSON.stringify({ product_id: product.id, price }) });
    }

    // Percentage-based alerts
    const pctAlerts = db.findAll('price_alerts', a =>
      a.product_id === product.id && a.is_active === 1 && !a.triggered && a.alert_type === 'percentage'
    );
    for (const alert of pctAlerts) {
      const avgPrice = existingPrices.length > 0 ? existingPrices.reduce((s, p) => s + p, 0) / existingPrices.length : price;
      const dropPct = ((avgPrice - price) / avgPrice) * 100;
      if (dropPct >= (alert.target_percentage || 10)) {
        db.update('price_alerts', a => a.id === alert.id, { triggered: 1, triggered_at: new Date().toISOString() });
        db.insert('notifications', { user_id: alert.user_id, type: 'price_drop', title: `${Math.round(dropPct)}% Price Drop: ${product_name}`, message: `Price dropped ${Math.round(dropPct)}% to $${price.toFixed(2)}`, is_read: 0, data: JSON.stringify({ product_id: product.id, price, drop_pct: dropPct }) });
      }
    }

    res.json({ price_entry_id: entry.lastInsertRowid, product, analysis, alerts_triggered: alerts.length + pctAlerts.filter(a => a.triggered).length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/prices/search', authMiddleware, (req, res) => {
  const { q, city, category, store, sort, min_price, max_price } = req.query;
  let entries = db.findAll('price_entries');
  const products = db.findAll('products');
  const categories = db.findAll('categories');

  let results = entries.map(pe => {
    const pr = products.find(p => p.id === pe.product_id);
    if (!pr) return null;
    const cat = categories.find(c => c.id === pr.category_id);
    return { ...pe, product_name: pr.name, barcode: pr.barcode, category_name: cat?.name || '', category_icon: cat?.icon || '', subcategory: pr.subcategory || '' };
  }).filter(Boolean);

  if (q) { const ql = q.toLowerCase(); results = results.filter(r => r.product_name.toLowerCase().includes(ql) || (r.store_name || '').toLowerCase().includes(ql)); }
  if (city) results = results.filter(r => (r.city || '').toLowerCase().includes(city.toLowerCase()));
  if (category) results = results.filter(r => r.category_name === category);
  if (store) results = results.filter(r => (r.store_name || '').toLowerCase().includes(store.toLowerCase()));
  if (min_price) results = results.filter(r => r.price >= parseFloat(min_price));
  if (max_price) results = results.filter(r => r.price <= parseFloat(max_price));

  const grouped = {};
  for (const r of results) {
    if (!grouped[r.product_id]) {
      const productPrices = entries.filter(e => e.product_id === r.product_id);
      grouped[r.product_id] = { ...r, avg_price: productPrices.reduce((s, e) => s + e.price, 0) / productPrices.length, min_price: Math.min(...productPrices.map(e => e.price)), max_price: Math.max(...productPrices.map(e => e.price)), total_entries: productPrices.length };
    }
  }

  let final = Object.values(grouped);
  if (sort === 'price_asc') final.sort((a, b) => a.price - b.price);
  else if (sort === 'price_desc') final.sort((a, b) => b.price - a.price);
  else if (sort === 'entries') final.sort((a, b) => b.total_entries - a.total_entries);
  else final.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  res.json(final.slice(0, 100));
});

router.get('/prices/product/:id', authMiddleware, (req, res) => {
  const productId = parseInt(req.params.id);
  const product = db.findOne('products', p => p.id === productId);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  const cat = db.findOne('categories', c => c.id === product.category_id);
  product.category_name = cat?.name || '';
  product.icon = cat?.icon || '';

  const prices = db.findAll('price_entries', pe => pe.product_id === productId)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 100)
    .map(pe => { const user = db.findOne('users', u => u.id === pe.user_id); return { ...pe, user_name: user?.name || 'Unknown' }; });

  const allPrices = db.findAll('price_entries', pe => pe.product_id === productId);
  const priceValues = allPrices.map(p => p.price);
  const stats = {
    avg: priceValues.length ? priceValues.reduce((s, p) => s + p, 0) / priceValues.length : 0,
    min: priceValues.length ? Math.min(...priceValues) : 0,
    max: priceValues.length ? Math.max(...priceValues) : 0,
    count: priceValues.length,
    median: priceValues.length ? priceValues.sort((a, b) => a - b)[Math.floor(priceValues.length / 2)] : 0
  };

  // Store comparison
  const storeMap = {};
  for (const pe of allPrices) {
    if (pe.store_name) {
      if (!storeMap[pe.store_name]) storeMap[pe.store_name] = { store: pe.store_name, prices: [], latest: pe };
      storeMap[pe.store_name].prices.push(pe.price);
      if (new Date(pe.created_at) > new Date(storeMap[pe.store_name].latest.created_at)) storeMap[pe.store_name].latest = pe;
    }
  }
  const stores = Object.values(storeMap).map(s => ({
    store: s.store, latest_price: s.latest.price,
    avg_price: s.prices.reduce((a, b) => a + b, 0) / s.prices.length,
    min_price: Math.min(...s.prices), entry_count: s.prices.length
  })).sort((a, b) => a.latest_price - b.latest_price);

  // Price history for chart
  const history = allPrices.sort((a, b) => new Date(a.created_at) - new Date(b.created_at)).map(p => ({ price: p.price, date: p.created_at.split('T')[0], store: p.store_name }));

  res.json({ product, prices, stats, stores, history });
});

router.get('/prices/trending', authMiddleware, (req, res) => {
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const recentEntries = db.findAll('price_entries', pe => pe.created_at > sevenDaysAgo);
  const byProduct = {};
  for (const pe of recentEntries) { if (!byProduct[pe.product_id]) byProduct[pe.product_id] = []; byProduct[pe.product_id].push(pe); }
  const products = db.findAll('products');
  const categories = db.findAll('categories');
  const trending = Object.entries(byProduct).map(([pid, entries]) => {
    const pr = products.find(p => p.id === parseInt(pid));
    const cat = categories.find(c => c.id === pr?.category_id);
    const prices = entries.map(e => e.price);
    return { id: parseInt(pid), name: pr?.name || '', icon: cat?.icon || '', category: cat?.name || '', entry_count: entries.length, avg_price: prices.reduce((s, p) => s + p, 0) / prices.length, min_price: Math.min(...prices), max_price: Math.max(...prices), latest_price: entries.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0].price };
  }).sort((a, b) => b.entry_count - a.entry_count).slice(0, 30);
  res.json(trending);
});

router.get('/prices/deals', authMiddleware, (req, res) => {
  const entries = db.findAll('price_entries').filter(pe => pe.ai_score >= 70 || pe.is_sale === 1);
  const products = db.findAll('products');
  const categories = db.findAll('categories');
  const deals = entries.sort((a, b) => (b.ai_score || 0) - (a.ai_score || 0)).slice(0, 30).map(pe => {
    const pr = products.find(p => p.id === pe.product_id);
    const cat = categories.find(c => c.id === pr?.category_id);
    const user = db.findOne('users', u => u.id === pe.user_id);
    return { ...pe, product_name: pr?.name || '', icon: cat?.icon || '', category: cat?.name || '', contributor: user?.name || '' };
  });
  res.json(deals);
});

router.post('/prices/:id/verify', authMiddleware, (req, res) => {
  const entryId = parseInt(req.params.id);
  const entry = db.findOne('price_entries', pe => pe.id === entryId);
  if (!entry) return res.status(404).json({ error: 'Not found' });
  const existing = db.findOne('price_verifications', v => v.entry_id === entryId && v.user_id === req.userId);
  if (existing) return res.status(400).json({ error: 'Already verified' });
  db.insert('price_verifications', { entry_id: entryId, user_id: req.userId, is_accurate: req.body.is_accurate ? 1 : 0 });
  db.update('price_entries', pe => pe.id === entryId, { verified_count: (entry.verified_count || 0) + 1 });
  const contributor = db.findOne('users', u => u.id === entry.user_id);
  if (contributor && req.body.is_accurate) db.update('users', u => u.id === entry.user_id, { reputation: (contributor.reputation || 0) + 2 });
  res.json({ success: true });
});

router.get('/prices/compare', authMiddleware, (req, res) => {
  const { product_id } = req.query;
  if (!product_id) return res.status(400).json({ error: 'product_id required' });
  const entries = db.findAll('price_entries', pe => pe.product_id === parseInt(product_id));
  const storeMap = {};
  for (const e of entries) {
    const store = e.store_name || 'Unknown';
    if (!storeMap[store]) storeMap[store] = { store, prices: [], cities: new Set() };
    storeMap[store].prices.push({ price: e.price, date: e.created_at, is_sale: e.is_sale });
    if (e.city) storeMap[store].cities.add(e.city);
  }
  const comparison = Object.values(storeMap).map(s => ({
    store: s.store, cities: [...s.cities], current_price: s.prices.sort((a, b) => new Date(b.date) - new Date(a.date))[0].price,
    avg_price: s.prices.reduce((sum, p) => sum + p.price, 0) / s.prices.length,
    min_price: Math.min(...s.prices.map(p => p.price)), max_price: Math.max(...s.prices.map(p => p.price)),
    entries: s.prices.length, has_sale: s.prices.some(p => p.is_sale)
  })).sort((a, b) => a.current_price - b.current_price);
  res.json(comparison);
});

router.get('/prices/predict/:id', authMiddleware, async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    const product = db.findOne('products', p => p.id === productId);
    if (!product) return res.status(404).json({ error: 'Not found' });
    const cat = db.findOne('categories', c => c.id === product.category_id);
    const entries = db.findAll('price_entries', pe => pe.product_id === productId).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const history = entries.map(e => ({ price: e.price, date: e.created_at.split('T')[0] }));
    const prediction = await predictPrice(product.name, history, cat?.name || 'General');
    res.json(prediction);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== WATCHLIST ====================
router.get('/watchlist', authMiddleware, (req, res) => {
  const items = db.findAll('watchlist', w => w.user_id === req.userId).map(w => {
    const product = db.findOne('products', p => p.id === w.product_id);
    const cat = product ? db.findOne('categories', c => c.id === product.category_id) : null;
    const latestPrice = db.findAll('price_entries', pe => pe.product_id === w.product_id).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
    const allPrices = db.findAll('price_entries', pe => pe.product_id === w.product_id).map(pe => pe.price);
    return { ...w, product_name: product?.name || '', icon: cat?.icon || '', latest_price: latestPrice?.price || null, avg_price: allPrices.length ? allPrices.reduce((s, p) => s + p, 0) / allPrices.length : 0, price_count: allPrices.length };
  });
  res.json(items);
});

router.post('/watchlist', authMiddleware, (req, res) => {
  const { product_id } = req.body;
  const existing = db.findOne('watchlist', w => w.user_id === req.userId && w.product_id === product_id);
  if (existing) return res.status(400).json({ error: 'Already in watchlist' });
  const result = db.insert('watchlist', { user_id: req.userId, product_id, added_at: new Date().toISOString() });
  res.json({ id: result.lastInsertRowid });
});

router.delete('/watchlist/:id', authMiddleware, (req, res) => {
  db.delete('watchlist', w => w.id === parseInt(req.params.id) && w.user_id === req.userId);
  res.json({ success: true });
});

// ==================== SERVICE QUOTES ====================
router.post('/services/quote', authMiddleware, async (req, res) => {
  try {
    const { service_type, description, quoted_price, currency, provider_name, city, country, urgency } = req.body;
    if (!service_type || !quoted_price) return res.status(400).json({ error: 'Service type and price required' });
    const analysis = await analyzeServiceQuote(service_type, description || '', quoted_price, city || 'Unknown', country || 'Unknown');
    const result = db.insert('service_quotes', { user_id: req.userId, service_type, description: description || '', quoted_price, currency: currency || 'USD', provider_name: provider_name || '', city: city || '', country: country || '', urgency: urgency || 'normal', ai_fairness_score: analysis.fairness_score, ai_analysis: JSON.stringify(analysis) });
    res.json({ id: result.lastInsertRowid, analysis });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/services/quotes', authMiddleware, (req, res) => {
  const quotes = db.findAll('service_quotes', q => q.user_id === req.userId)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 50)
    .map(q => ({ ...q, ai_analysis: q.ai_analysis ? JSON.parse(q.ai_analysis) : null }));
  res.json(quotes);
});

// ==================== ALERTS ====================
router.post('/alerts', authMiddleware, (req, res) => {
  const { product_id, target_price, alert_type, target_percentage, product_name } = req.body;
  const result = db.insert('price_alerts', { user_id: req.userId, product_id: product_id || null, product_name: product_name || '', target_price: target_price || 0, alert_type: alert_type || 'price', target_percentage: target_percentage || 0, is_active: 1, triggered: 0, snoozed: 0, snoozed_until: null });
  res.json({ id: result.lastInsertRowid });
});

router.get('/alerts', authMiddleware, (req, res) => {
  const alerts = db.findAll('price_alerts', a => a.user_id === req.userId)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .map(a => { const product = db.findOne('products', p => p.id === a.product_id); return { ...a, product_name: a.product_name || product?.name || 'Unknown' }; });
  res.json(alerts);
});

router.delete('/alerts/:id', authMiddleware, (req, res) => {
  db.delete('price_alerts', a => a.id === parseInt(req.params.id) && a.user_id === req.userId);
  res.json({ success: true });
});

router.patch('/alerts/:id/snooze', authMiddleware, (req, res) => {
  const { days } = req.body;
  const until = new Date(Date.now() + (days || 7) * 86400000).toISOString();
  db.update('price_alerts', a => a.id === parseInt(req.params.id) && a.user_id === req.userId, { snoozed: 1, snoozed_until: until });
  res.json({ success: true });
});

router.patch('/alerts/:id/reactivate', authMiddleware, (req, res) => {
  db.update('price_alerts', a => a.id === parseInt(req.params.id) && a.user_id === req.userId, { triggered: 0, snoozed: 0, snoozed_until: null });
  res.json({ success: true });
});

// ==================== SPENDING TRACKER ====================
router.post('/spending', authMiddleware, (req, res) => {
  const { category, amount, currency, description, date, tags, is_recurring } = req.body;
  const result = db.insert('spending_tracker', { user_id: req.userId, category, amount, currency: currency || 'USD', description: description || '', date: date || new Date().toISOString().split('T')[0], tags: tags || '', is_recurring: is_recurring ? 1 : 0 });
  res.json({ id: result.lastInsertRowid });
});

router.get('/spending', authMiddleware, (req, res) => {
  const { period, category } = req.query;
  let daysBack = 30;
  if (period === 'week') daysBack = 7;
  if (period === 'year') daysBack = 365;
  if (period === 'day') daysBack = 1;
  const cutoff = new Date(Date.now() - daysBack * 86400000).toISOString().split('T')[0];
  let spending = db.findAll('spending_tracker', s => s.user_id === req.userId && s.date >= cutoff).sort((a, b) => b.date.localeCompare(a.date));
  if (category) spending = spending.filter(s => s.category === category);

  const byCategoryMap = {};
  for (const s of spending) { if (!byCategoryMap[s.category]) byCategoryMap[s.category] = { category: s.category, total: 0, count: 0, items: [] }; byCategoryMap[s.category].total += s.amount; byCategoryMap[s.category].count++; byCategoryMap[s.category].items.push(s); }
  const byCategory = Object.values(byCategoryMap).sort((a, b) => b.total - a.total);

  // Daily breakdown
  const byDateMap = {};
  for (const s of spending) { if (!byDateMap[s.date]) byDateMap[s.date] = { date: s.date, total: 0, count: 0 }; byDateMap[s.date].total += s.amount; byDateMap[s.date].count++; }
  const byDate = Object.values(byDateMap).sort((a, b) => a.date.localeCompare(b.date));

  const total = spending.reduce((s, e) => s + e.amount, 0);
  const avg_daily = daysBack > 0 ? total / daysBack : 0;

  res.json({ entries: spending, by_category: byCategory, by_date: byDate, total, avg_daily, period: period || 'month' });
});

router.delete('/spending/:id', authMiddleware, (req, res) => {
  db.delete('spending_tracker', s => s.id === parseInt(req.params.id) && s.user_id === req.userId);
  res.json({ success: true });
});

router.get('/spending/insights', authMiddleware, async (req, res) => {
  try {
    const cutoff = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
    const spending = db.findAll('spending_tracker', s => s.user_id === req.userId && s.date >= cutoff);
    const byCat = {};
    for (const s of spending) { if (!byCat[s.category]) byCat[s.category] = { category: s.category, total: 0, count: 0 }; byCat[s.category].total += s.amount; byCat[s.category].count++; }
    const spendingData = Object.values(byCat);
    const budgets = db.findAll('budgets', b => b.user_id === req.userId);
    const insights = await generateSpendingInsights(spendingData, budgets);
    res.json(insights);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/spending/comparison', authMiddleware, (req, res) => {
  const now = new Date();
  const thisMonth = now.toISOString().slice(0, 7);
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 7);
  const thisMonthSpending = db.findAll('spending_tracker', s => s.user_id === req.userId && s.date.startsWith(thisMonth));
  const lastMonthSpending = db.findAll('spending_tracker', s => s.user_id === req.userId && s.date.startsWith(lastMonth));
  const thisTotal = thisMonthSpending.reduce((s, e) => s + e.amount, 0);
  const lastTotal = lastMonthSpending.reduce((s, e) => s + e.amount, 0);
  const change = lastTotal > 0 ? ((thisTotal - lastTotal) / lastTotal * 100) : 0;
  res.json({ this_month: thisTotal, last_month: lastTotal, change_pct: Math.round(change), direction: change > 0 ? 'up' : change < 0 ? 'down' : 'same' });
});

// ==================== BUDGETS ====================
router.get('/budgets', authMiddleware, (req, res) => {
  const budgets = db.findAll('budgets', b => b.user_id === req.userId);
  const cutoff = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
  const enhanced = budgets.map(b => {
    const spent = db.findAll('spending_tracker', s => s.user_id === req.userId && s.category === b.category && s.date >= cutoff).reduce((s, e) => s + e.amount, 0);
    return { ...b, spent, remaining: b.amount - spent, pct_used: b.amount > 0 ? Math.round(spent / b.amount * 100) : 0 };
  });
  res.json(enhanced);
});

router.post('/budgets', authMiddleware, (req, res) => {
  const { category, amount } = req.body;
  const existing = db.findOne('budgets', b => b.user_id === req.userId && b.category === category);
  if (existing) { db.update('budgets', b => b.id === existing.id, { amount }); return res.json({ id: existing.id, updated: true }); }
  const result = db.insert('budgets', { user_id: req.userId, category, amount });
  res.json({ id: result.lastInsertRowid });
});

router.delete('/budgets/:id', authMiddleware, (req, res) => {
  db.delete('budgets', b => b.id === parseInt(req.params.id) && b.user_id === req.userId);
  res.json({ success: true });
});

// ==================== SAVINGS GOALS ====================
router.get('/savings', authMiddleware, (req, res) => {
  const goals = db.findAll('savings_goals', g => g.user_id === req.userId && g.is_active === 1);
  res.json(goals);
});

router.post('/savings', authMiddleware, (req, res) => {
  const { name, target_amount, current_amount, deadline, icon } = req.body;
  const result = db.insert('savings_goals', { user_id: req.userId, name, target_amount, current_amount: current_amount || 0, deadline: deadline || '', icon: icon || '🎯', is_active: 1 });
  res.json({ id: result.lastInsertRowid });
});

router.post('/savings/:id/deposit', authMiddleware, (req, res) => {
  const { amount } = req.body;
  const goal = db.findOne('savings_goals', g => g.id === parseInt(req.params.id) && g.user_id === req.userId);
  if (!goal) return res.status(404).json({ error: 'Not found' });
  db.update('savings_goals', g => g.id === goal.id, { current_amount: (goal.current_amount || 0) + amount });
  res.json({ success: true, new_amount: (goal.current_amount || 0) + amount });
});

router.delete('/savings/:id', authMiddleware, (req, res) => {
  db.update('savings_goals', g => g.id === parseInt(req.params.id) && g.user_id === req.userId, { is_active: 0 });
  res.json({ success: true });
});

// ==================== BILL REMINDERS ====================
router.get('/bills', authMiddleware, (req, res) => {
  const bills = db.findAll('bills', b => b.user_id === req.userId && b.is_active === 1).sort((a, b) => a.due_date.localeCompare(b.due_date));
  res.json(bills);
});

router.post('/bills', authMiddleware, (req, res) => {
  const { name, amount, due_date, frequency, category } = req.body;
  const result = db.insert('bills', { user_id: req.userId, name, amount, due_date, frequency: frequency || 'monthly', category: category || 'Utilities', is_paid: 0, is_active: 1 });
  res.json({ id: result.lastInsertRowid });
});

router.patch('/bills/:id/paid', authMiddleware, (req, res) => {
  db.update('bills', b => b.id === parseInt(req.params.id) && b.user_id === req.userId, { is_paid: 1, paid_at: new Date().toISOString() });
  res.json({ success: true });
});

router.delete('/bills/:id', authMiddleware, (req, res) => {
  db.update('bills', b => b.id === parseInt(req.params.id) && b.user_id === req.userId, { is_active: 0 });
  res.json({ success: true });
});

// ==================== NOTIFICATIONS ====================
router.get('/notifications', authMiddleware, (req, res) => {
  const notifications = db.findAll('notifications', n => n.user_id === req.userId).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 50);
  const unread = notifications.filter(n => !n.is_read).length;
  res.json({ notifications, unread });
});

router.patch('/notifications/read', authMiddleware, (req, res) => {
  db.update('notifications', n => n.user_id === req.userId && !n.is_read, { is_read: 1 });
  res.json({ success: true });
});

// ==================== STORES ====================
router.get('/stores', authMiddleware, (req, res) => {
  const entries = db.findAll('price_entries');
  const storeMap = {};
  for (const e of entries) {
    if (!e.store_name) continue;
    if (!storeMap[e.store_name]) storeMap[e.store_name] = { name: e.store_name, cities: new Set(), entry_count: 0, avg_score: 0, scores: [] };
    storeMap[e.store_name].entry_count++;
    if (e.city) storeMap[e.store_name].cities.add(e.city);
    if (e.ai_score) storeMap[e.store_name].scores.push(e.ai_score);
  }
  const stores = Object.values(storeMap).map(s => ({ name: s.name, cities: [...s.cities], entry_count: s.entry_count, avg_deal_score: s.scores.length ? Math.round(s.scores.reduce((a, b) => a + b, 0) / s.scores.length) : 50 })).sort((a, b) => b.entry_count - a.entry_count);
  const ratings = db.findAll('store_ratings');
  for (const store of stores) {
    const storeRatings = ratings.filter(r => r.store_name === store.name);
    store.user_rating = storeRatings.length ? (storeRatings.reduce((s, r) => s + r.rating, 0) / storeRatings.length).toFixed(1) : null;
    store.rating_count = storeRatings.length;
  }
  res.json(stores.slice(0, 50));
});

router.post('/stores/rate', authMiddleware, (req, res) => {
  const { store_name, rating, review } = req.body;
  const existing = db.findOne('store_ratings', r => r.user_id === req.userId && r.store_name === store_name);
  if (existing) { db.update('store_ratings', r => r.id === existing.id, { rating, review: review || '' }); return res.json({ updated: true }); }
  db.insert('store_ratings', { user_id: req.userId, store_name, rating, review: review || '' });
  res.json({ success: true });
});

// ==================== COMMUNITY ====================
router.get('/community/stats', (req, res) => {
  const totalUsers = db.count('users');
  const totalPrices = db.count('price_entries');
  const totalProducts = db.count('products');
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const weeklyPrices = db.count('price_entries', pe => pe.created_at > sevenDaysAgo);
  const topCategories = {};
  const entries = db.findAll('price_entries');
  const products = db.findAll('products');
  const categories = db.findAll('categories');
  for (const e of entries) {
    const p = products.find(pr => pr.id === e.product_id);
    const c = p ? categories.find(cat => cat.id === p.category_id) : null;
    if (c) { topCategories[c.name] = (topCategories[c.name] || 0) + 1; }
  }
  res.json({ total_users: totalUsers, total_prices: totalPrices, total_products: totalProducts, weekly_prices: weeklyPrices, top_categories: Object.entries(topCategories).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count]) => ({ name, count })) });
});

router.get('/community/leaderboard', (req, res) => {
  const users = db.findAll('users').sort((a, b) => (b.total_contributions || 0) - (a.total_contributions || 0)).slice(0, 20).map(u => ({ id: u.id, name: u.name, city: u.city, contributions: u.total_contributions || 0, reputation: u.reputation || 0, avatar_color: u.avatar_color || '#3b82f6', joined: u.joined_at || u.created_at }));
  res.json(users);
});

// ==================== EXPORT ====================
router.get('/export/prices', authMiddleware, (req, res) => {
  const entries = db.findAll('price_entries', pe => pe.user_id === req.userId);
  const products = db.findAll('products');
  const data = entries.map(e => { const p = products.find(pr => pr.id === e.product_id); return { product: p?.name || '', price: e.price, store: e.store_name, city: e.city, date: e.created_at, is_sale: e.is_sale ? 'Yes' : 'No', notes: e.notes }; });
  res.json(data);
});

router.get('/export/spending', authMiddleware, (req, res) => {
  const spending = db.findAll('spending_tracker', s => s.user_id === req.userId).sort((a, b) => b.date.localeCompare(a.date));
  res.json(spending);
});

// ==================== FEEDBACK ====================
router.post('/feedback', authMiddleware, (req, res) => {
  const { type, message, rating } = req.body;
  db.insert('feedback', { user_id: req.userId, type: type || 'general', message, rating: rating || 0 });
  res.json({ success: true });
});

// ==================== CATEGORIES ====================
router.get('/categories', (req, res) => {
  const categories = db.findAll('categories').sort((a, b) => a.name.localeCompare(b.name));
  res.json(categories);
});

// ==================== ANALYTICS ====================
router.get('/analytics', authMiddleware, (req, res) => {
  const myEntries = db.findAll('price_entries', pe => pe.user_id === req.userId);
  const products = db.findAll('products');
  const categories = db.findAll('categories');

  // Category distribution
  const catMap = {};
  for (const e of myEntries) {
    const p = products.find(pr => pr.id === e.product_id);
    const c = p ? categories.find(cat => cat.id === p.category_id) : null;
    const catName = c?.name || 'Other';
    if (!catMap[catName]) catMap[catName] = { name: catName, icon: c?.icon || '📦', count: 0, total_spent: 0 };
    catMap[catName].count++;
    catMap[catName].total_spent += e.price;
  }
  const categoryBreakdown = Object.values(catMap).sort((a, b) => b.count - a.count);

  // Monthly trends
  const monthMap = {};
  for (const e of myEntries) {
    const month = e.created_at.slice(0, 7);
    if (!monthMap[month]) monthMap[month] = { month, count: 0, total: 0 };
    monthMap[month].count++;
    monthMap[month].total += e.price;
  }
  const monthlyTrends = Object.values(monthMap).sort((a, b) => a.month.localeCompare(b.month));

  // Top stores
  const storeMap = {};
  for (const e of myEntries) {
    if (!e.store_name) continue;
    if (!storeMap[e.store_name]) storeMap[e.store_name] = { store: e.store_name, count: 0, avg_score: 0, scores: [] };
    storeMap[e.store_name].count++;
    if (e.ai_score) storeMap[e.store_name].scores.push(e.ai_score);
  }
  const topStores = Object.values(storeMap).map(s => ({ ...s, avg_score: s.scores.length ? Math.round(s.scores.reduce((a, b) => a + b, 0) / s.scores.length) : 50 })).sort((a, b) => b.count - a.count).slice(0, 10);

  // Spending (from spending tracker)
  const spending = db.findAll('spending_tracker', s => s.user_id === req.userId);
  const totalSpending = spending.reduce((s, e) => s + e.amount, 0);

  res.json({ total_entries: myEntries.length, total_products_tracked: new Set(myEntries.map(e => e.product_id)).size, category_breakdown: categoryBreakdown, monthly_trends: monthlyTrends, top_stores: topStores, total_spending: totalSpending });
});

// ==================== SMART BUDGET AI ====================
router.post('/smart-budget', authMiddleware, async (req, res) => {
  try {
    const { income } = req.body;
    const cutoff = new Date(Date.now() - 90 * 86400000).toISOString().split('T')[0];
    const spending = db.findAll('spending_tracker', s => s.user_id === req.userId && s.date >= cutoff);
    const byCat = {};
    for (const s of spending) { if (!byCat[s.category]) byCat[s.category] = { category: s.category, total: 0, count: 0 }; byCat[s.category].total += s.amount; byCat[s.category].count++; }
    const history = Object.values(byCat);
    const result = await generateSmartBudget(history, income);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== DASHBOARD ====================
router.get('/dashboard', authMiddleware, (req, res) => {
  const user = db.findOne('users', u => u.id === req.userId);
  if (!user) return res.status(404).json({ error: 'Not found' });
  const { password, ...safeUser } = user;

  const recentPrices = db.findAll('price_entries', pe => pe.user_id === req.userId)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 10)
    .map(pe => { const pr = db.findOne('products', p => p.id === pe.product_id); const cat = pr ? db.findOne('categories', c => c.id === pr.category_id) : null; return { ...pe, product_name: pr?.name || '', icon: cat?.icon || '' }; });

  const totalContributions = db.count('price_entries', pe => pe.user_id === req.userId);
  const activeAlerts = db.count('price_alerts', a => a.user_id === req.userId && a.is_active === 1);
  const triggeredAlerts = db.findAll('price_alerts', a => a.user_id === req.userId && a.triggered === 1 && a.is_active === 1)
    .map(a => { const product = db.findOne('products', p => p.id === a.product_id); return { ...a, product_name: a.product_name || product?.name || '' }; });

  const cutoff = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
  const monthlySpend = db.sum('spending_tracker', 'amount', s => s.user_id === req.userId && s.date >= cutoff);

  // Budgets overview
  const budgets = db.findAll('budgets', b => b.user_id === req.userId);
  const budgetOverview = budgets.map(b => {
    const spent = db.findAll('spending_tracker', s => s.user_id === req.userId && s.category === b.category && s.date >= cutoff).reduce((s, e) => s + e.amount, 0);
    return { category: b.category, budget: b.amount, spent, pct: b.amount > 0 ? Math.round(spent / b.amount * 100) : 0 };
  });

  // Savings goals overview
  const savings = db.findAll('savings_goals', g => g.user_id === req.userId && g.is_active === 1);
  const totalSaved = savings.reduce((s, g) => s + (g.current_amount || 0), 0);

  // Upcoming bills
  const today = new Date().toISOString().split('T')[0];
  const upcomingBills = db.findAll('bills', b => b.user_id === req.userId && b.is_active === 1 && !b.is_paid && b.due_date >= today).sort((a, b) => a.due_date.localeCompare(b.due_date)).slice(0, 5);

  // Unread notifications
  const unreadNotifications = db.count('notifications', n => n.user_id === req.userId && !n.is_read);

  // Watchlist count
  const watchlistCount = db.count('watchlist', w => w.user_id === req.userId);

  // Recent deals
  const recentDeals = db.findAll('price_entries', pe => pe.ai_score >= 70)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5)
    .map(pe => { const pr = db.findOne('products', p => p.id === pe.product_id); const cat = pr ? db.findOne('categories', c => c.id === pr.category_id) : null; return { product_name: pr?.name || '', price: pe.price, score: pe.ai_score, icon: cat?.icon || '📦', store: pe.store_name }; });

  res.json({
    user: safeUser, recent_prices: recentPrices, total_contributions: totalContributions,
    active_alerts: activeAlerts, triggered_alerts: triggeredAlerts,
    monthly_spend: monthlySpend || 0, budget_overview: budgetOverview,
    savings: { goals: savings, total_saved: totalSaved },
    upcoming_bills: upcomingBills, unread_notifications: unreadNotifications,
    watchlist_count: watchlistCount, recent_deals: recentDeals
  });
});

module.exports = router;
