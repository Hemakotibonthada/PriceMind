const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('./database');
const { authMiddleware, generateToken } = require('./auth');
const { analyzePriceFairness, analyzeServiceQuote, categorizeProduct, generateSpendingInsights, predictPrice, generateSmartBudget, calculateFinancialHealth, analyzeReceipt, getDailyTip, generateChallenge, getAchievementDefinitions, generateFinancialQuiz } = require('./ai');

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
      theme: 'dark', total_contributions: 0, reputation: 0, xp: 0, level: 1,
      streak: 0, best_streak: 0, last_login_date: new Date().toISOString().split('T')[0],
      joined_at: new Date().toISOString(), last_active: new Date().toISOString(),
      badges: '[]', preferences: '{}', avatar_emoji: '😀',
      bio: '', income: 0, financial_health_score: 50
    });
    const token = generateToken(result.lastInsertRowid);
    // Grant first achievement
    db.insert('user_achievements', { user_id: result.lastInsertRowid, achievement_id: 'welcome', unlocked_at: new Date().toISOString() });
    res.json({ token, user: { id: result.lastInsertRowid, email, name } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = db.findOne('users', u => u.email === email);
    if (!user || !(await bcrypt.compare(password, user.password)))
      return res.status(401).json({ error: 'Invalid credentials' });
    // Update streak
    const today = new Date().toISOString().split('T')[0];
    const lastLogin = user.last_login_date || '';
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    let streak = user.streak || 0;
    if (lastLogin === yesterday) streak++;
    else if (lastLogin !== today) streak = 1;
    const bestStreak = Math.max(streak, user.best_streak || 0);
    db.update('users', u => u.id === user.id, { last_active: new Date().toISOString(), last_login_date: today, streak, best_streak: bestStreak });
    const token = generateToken(user.id);
    const { password: _, ...safe } = user;
    safe.streak = streak;
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
  const { name, city, country, currency, theme, bio, avatar_emoji, income } = req.body;
  const updates = {};
  if (name) updates.name = name;
  if (city !== undefined) updates.city = city;
  if (country !== undefined) updates.country = country;
  if (currency) updates.currency = currency;
  if (theme) updates.theme = theme;
  if (bio !== undefined) updates.bio = bio;
  if (avatar_emoji) updates.avatar_emoji = avatar_emoji;
  if (income !== undefined) updates.income = income;
  db.update('users', u => u.id === req.userId, updates);
  const user = db.findOne('users', u => u.id === req.userId);
  const { password, ...safe } = user;
  res.json(safe);
});

router.post('/auth/change-password', authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = db.findOne('users', u => u.id === req.userId);
    if (!(await bcrypt.compare(currentPassword, user.password))) return res.status(400).json({ error: 'Current password incorrect' });
    const hash = await bcrypt.hash(newPassword, 10);
    db.update('users', u => u.id === req.userId, { password: hash });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== PRICES ====================
router.post('/prices', authMiddleware, async (req, res) => {
  try {
    const { product_name, barcode, price, currency, store_name, city, country, is_sale, notes, photo_url, unit, quantity, tags } = req.body;
    if (!product_name || !price) return res.status(400).json({ error: 'Product name and price required' });
    const categorization = await categorizeProduct(product_name);
    const cat = db.findOne('categories', c => c.name === categorization.category) || db.findOne('categories', c => c.name === 'Groceries');
    let product = db.findOne('products', p => p.name.toLowerCase() === product_name.toLowerCase());
    if (!product) {
      const pResult = db.insert('products', { name: product_name, barcode: barcode || '', category_id: cat?.id || 1, subcategory: categorization.subcategory || '', tags: JSON.stringify(categorization.tags || []) });
      product = db.findOne('products', p => p.id === pResult.lastInsertRowid);
    }
    const existingPrices = db.findAll('price_entries', pe => pe.product_id === product.id).map(pe => pe.price);
    const analysis = await analyzePriceFairness(product_name, price, existingPrices, categorization.category);
    const entry = db.insert('price_entries', {
      user_id: req.userId, product_id: product.id, price, currency: currency || 'USD',
      store_name: store_name || '', city: city || '', country: country || '',
      is_sale: is_sale ? 1 : 0, notes: notes || '', photo_url: photo_url || '',
      unit: unit || '', quantity: quantity || 1, verified_count: 0,
      ai_score: analysis.score, ai_rating: analysis.rating, tags: tags || ''
    });
    // Update user stats
    const user = db.findOne('users', u => u.id === req.userId);
    const newXp = (user.xp || 0) + 10;
    const newLevel = Math.floor(newXp / 100) + 1;
    db.update('users', u => u.id === req.userId, {
      total_contributions: (user.total_contributions || 0) + 1,
      reputation: (user.reputation || 0) + 5, xp: newXp, level: newLevel
    });
    // Check achievements
    checkAndGrantAchievements(req.userId);
    // Trigger alerts
    const alerts = db.findAll('price_alerts', a => a.product_id === product.id && a.is_active === 1 && !a.triggered && price <= a.target_price);
    for (const alert of alerts) {
      db.update('price_alerts', a => a.id === alert.id, { triggered: 1, triggered_at: new Date().toISOString() });
      db.insert('notifications', { user_id: alert.user_id, type: 'price_drop', title: `Price Drop: ${product_name}`, message: `Price dropped to $${price.toFixed(2)}`, is_read: 0, data: JSON.stringify({ product_id: product.id, price }), icon: '🔔', priority: 'high' });
    }
    // Percentage alerts
    const pctAlerts = db.findAll('price_alerts', a => a.product_id === product.id && a.is_active === 1 && !a.triggered && a.alert_type === 'percentage');
    for (const alert of pctAlerts) {
      const avgPrice = existingPrices.length > 0 ? existingPrices.reduce((s, p) => s + p, 0) / existingPrices.length : price;
      const dropPct = ((avgPrice - price) / avgPrice) * 100;
      if (dropPct >= (alert.target_percentage || 10)) {
        db.update('price_alerts', a => a.id === alert.id, { triggered: 1, triggered_at: new Date().toISOString() });
        db.insert('notifications', { user_id: alert.user_id, type: 'price_drop', title: `${Math.round(dropPct)}% Drop: ${product_name}`, message: `Dropped ${Math.round(dropPct)}% to $${price.toFixed(2)}`, is_read: 0, data: JSON.stringify({ product_id: product.id, price, drop_pct: dropPct }), icon: '📉', priority: 'high' });
      }
    }
    res.json({ price_entry_id: entry.lastInsertRowid, product, analysis, alerts_triggered: alerts.length, new_xp: newXp, new_level: newLevel });
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
  else if (sort === 'score') final.sort((a, b) => (b.ai_score || 0) - (a.ai_score || 0));
  else final.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  res.json(final.slice(0, 100));
});

router.get('/prices/product/:id', authMiddleware, (req, res) => {
  const productId = parseInt(req.params.id);
  const product = db.findOne('products', p => p.id === productId);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  const cat = db.findOne('categories', c => c.id === product.category_id);
  product.category_name = cat?.name || ''; product.icon = cat?.icon || '';
  const prices = db.findAll('price_entries', pe => pe.product_id === productId).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 100).map(pe => { const user = db.findOne('users', u => u.id === pe.user_id); return { ...pe, user_name: user?.name || 'Unknown' }; });
  const allPrices = db.findAll('price_entries', pe => pe.product_id === productId);
  const priceValues = allPrices.map(p => p.price);
  const stats = { avg: priceValues.length ? priceValues.reduce((s, p) => s + p, 0) / priceValues.length : 0, min: priceValues.length ? Math.min(...priceValues) : 0, max: priceValues.length ? Math.max(...priceValues) : 0, count: priceValues.length, median: priceValues.length ? [...priceValues].sort((a, b) => a - b)[Math.floor(priceValues.length / 2)] : 0, stddev: priceValues.length > 1 ? Math.sqrt(priceValues.reduce((s, p) => s + Math.pow(p - (priceValues.reduce((a, b) => a + b, 0) / priceValues.length), 2), 0) / priceValues.length) : 0 };
  const storeMap = {};
  for (const pe of allPrices) { if (pe.store_name) { if (!storeMap[pe.store_name]) storeMap[pe.store_name] = { store: pe.store_name, prices: [], latest: pe }; storeMap[pe.store_name].prices.push(pe.price); if (new Date(pe.created_at) > new Date(storeMap[pe.store_name].latest.created_at)) storeMap[pe.store_name].latest = pe; } }
  const stores = Object.values(storeMap).map(s => ({ store: s.store, latest_price: s.latest.price, avg_price: s.prices.reduce((a, b) => a + b, 0) / s.prices.length, min_price: Math.min(...s.prices), entry_count: s.prices.length })).sort((a, b) => a.latest_price - b.latest_price);
  const history = allPrices.sort((a, b) => new Date(a.created_at) - new Date(b.created_at)).map(p => ({ price: p.price, date: p.created_at.split('T')[0], store: p.store_name }));
  res.json({ product, prices, stats, stores, history });
});

router.get('/prices/trending', authMiddleware, (req, res) => {
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const recentEntries = db.findAll('price_entries', pe => pe.created_at > sevenDaysAgo);
  const byProduct = {};
  for (const pe of recentEntries) { if (!byProduct[pe.product_id]) byProduct[pe.product_id] = []; byProduct[pe.product_id].push(pe); }
  const products = db.findAll('products'); const categories = db.findAll('categories');
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
  const products = db.findAll('products'); const categories = db.findAll('categories');
  const deals = entries.sort((a, b) => (b.ai_score || 0) - (a.ai_score || 0)).slice(0, 30).map(pe => {
    const pr = products.find(p => p.id === pe.product_id); const cat = categories.find(c => c.id === pr?.category_id);
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
  // XP for verifier
  const verifier = db.findOne('users', u => u.id === req.userId);
  db.update('users', u => u.id === req.userId, { xp: (verifier.xp || 0) + 5 });
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
    avg_price: s.prices.reduce((sum, p) => sum + p.price, 0) / s.prices.length, min_price: Math.min(...s.prices.map(p => p.price)), max_price: Math.max(...s.prices.map(p => p.price)),
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

router.delete('/prices/:id', authMiddleware, (req, res) => {
  db.delete('price_entries', pe => pe.id === parseInt(req.params.id) && pe.user_id === req.userId);
  res.json({ success: true });
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
  const quotes = db.findAll('service_quotes', q => q.user_id === req.userId).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 50).map(q => ({ ...q, ai_analysis: q.ai_analysis ? JSON.parse(q.ai_analysis) : null }));
  res.json(quotes);
});

// ==================== ALERTS ====================
router.post('/alerts', authMiddleware, (req, res) => {
  const { product_id, target_price, alert_type, target_percentage, product_name } = req.body;
  const result = db.insert('price_alerts', { user_id: req.userId, product_id: product_id || null, product_name: product_name || '', target_price: target_price || 0, alert_type: alert_type || 'price', target_percentage: target_percentage || 0, is_active: 1, triggered: 0, snoozed: 0, snoozed_until: null });
  checkAndGrantAchievements(req.userId);
  res.json({ id: result.lastInsertRowid });
});

router.get('/alerts', authMiddleware, (req, res) => {
  const alerts = db.findAll('price_alerts', a => a.user_id === req.userId).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).map(a => { const product = db.findOne('products', p => p.id === a.product_id); return { ...a, product_name: a.product_name || product?.name || 'Unknown' }; });
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
  const { category, amount, currency, description, date, tags, is_recurring, payment_method, mood } = req.body;
  const result = db.insert('spending_tracker', { user_id: req.userId, category, amount, currency: currency || 'USD', description: description || '', date: date || new Date().toISOString().split('T')[0], tags: tags || '', is_recurring: is_recurring ? 1 : 0, payment_method: payment_method || '', mood: mood || '' });
  // XP for tracking
  const user = db.findOne('users', u => u.id === req.userId);
  db.update('users', u => u.id === req.userId, { xp: (user.xp || 0) + 3 });
  res.json({ id: result.lastInsertRowid });
});

router.get('/spending', authMiddleware, (req, res) => {
  const { period, category } = req.query;
  let daysBack = 30;
  if (period === 'week') daysBack = 7;
  if (period === 'year') daysBack = 365;
  if (period === 'day') daysBack = 1;
  if (period === 'quarter') daysBack = 90;
  if (period === 'all') daysBack = 99999;
  const cutoff = new Date(Date.now() - daysBack * 86400000).toISOString().split('T')[0];
  let spending = db.findAll('spending_tracker', s => s.user_id === req.userId && s.date >= cutoff).sort((a, b) => b.date.localeCompare(a.date));
  if (category) spending = spending.filter(s => s.category === category);
  const byCategoryMap = {};
  for (const s of spending) { if (!byCategoryMap[s.category]) byCategoryMap[s.category] = { category: s.category, total: 0, count: 0, items: [] }; byCategoryMap[s.category].total += s.amount; byCategoryMap[s.category].count++; }
  const byCategory = Object.values(byCategoryMap).sort((a, b) => b.total - a.total);
  const byDateMap = {};
  for (const s of spending) { if (!byDateMap[s.date]) byDateMap[s.date] = { date: s.date, total: 0, count: 0 }; byDateMap[s.date].total += s.amount; byDateMap[s.date].count++; }
  const byDate = Object.values(byDateMap).sort((a, b) => a.date.localeCompare(b.date));
  const total = spending.reduce((s, e) => s + e.amount, 0);
  const avg_daily = daysBack > 0 ? total / Math.min(daysBack, 365) : 0;
  // Week-over-week change
  const thisWeekTotal = spending.filter(s => s.date >= new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]).reduce((s, e) => s + e.amount, 0);
  const lastWeekTotal = spending.filter(s => { const d = s.date; const w2 = new Date(Date.now() - 14 * 86400000).toISOString().split('T')[0]; const w1 = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]; return d >= w2 && d < w1; }).reduce((s, e) => s + e.amount, 0);
  const weekChange = lastWeekTotal > 0 ? ((thisWeekTotal - lastWeekTotal) / lastWeekTotal * 100).toFixed(1) : 0;
  res.json({ entries: spending, by_category: byCategory, by_date: byDate, total, avg_daily, period: period || 'month', week_change: weekChange, this_week: thisWeekTotal, last_week: lastWeekTotal });
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
  checkAndGrantAchievements(req.userId);
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
  const { name, target_amount, current_amount, deadline, icon, color } = req.body;
  const result = db.insert('savings_goals', { user_id: req.userId, name, target_amount, current_amount: current_amount || 0, deadline: deadline || '', icon: icon || '🎯', color: color || '#3b82f6', is_active: 1 });
  checkAndGrantAchievements(req.userId);
  res.json({ id: result.lastInsertRowid });
});

router.post('/savings/:id/deposit', authMiddleware, (req, res) => {
  const { amount } = req.body;
  const goal = db.findOne('savings_goals', g => g.id === parseInt(req.params.id) && g.user_id === req.userId);
  if (!goal) return res.status(404).json({ error: 'Not found' });
  const newAmount = (goal.current_amount || 0) + amount;
  db.update('savings_goals', g => g.id === goal.id, { current_amount: newAmount });
  // Record deposit history
  db.insert('savings_deposits', { goal_id: goal.id, user_id: req.userId, amount, date: new Date().toISOString() });
  // Check if goal completed
  if (newAmount >= goal.target_amount) {
    db.insert('notifications', { user_id: req.userId, type: 'achievement', title: `🎉 Goal Reached: ${goal.name}`, message: `You reached your savings goal of $${goal.target_amount}!`, is_read: 0, icon: '🎉', priority: 'high' });
    const user = db.findOne('users', u => u.id === req.userId);
    db.update('users', u => u.id === req.userId, { xp: (user.xp || 0) + 100 });
  }
  res.json({ success: true, new_amount: newAmount });
});

router.post('/savings/:id/withdraw', authMiddleware, (req, res) => {
  const { amount } = req.body;
  const goal = db.findOne('savings_goals', g => g.id === parseInt(req.params.id) && g.user_id === req.userId);
  if (!goal) return res.status(404).json({ error: 'Not found' });
  const newAmount = Math.max(0, (goal.current_amount || 0) - amount);
  db.update('savings_goals', g => g.id === goal.id, { current_amount: newAmount });
  db.insert('savings_deposits', { goal_id: goal.id, user_id: req.userId, amount: -amount, date: new Date().toISOString() });
  res.json({ success: true, new_amount: newAmount });
});

router.delete('/savings/:id', authMiddleware, (req, res) => {
  db.update('savings_goals', g => g.id === parseInt(req.params.id) && g.user_id === req.userId, { is_active: 0 });
  res.json({ success: true });
});

router.get('/savings/:id/history', authMiddleware, (req, res) => {
  const deposits = db.findAll('savings_deposits', d => d.goal_id === parseInt(req.params.id) && d.user_id === req.userId).sort((a, b) => new Date(b.date) - new Date(a.date));
  res.json(deposits);
});

// ==================== BILL REMINDERS ====================
router.get('/bills', authMiddleware, (req, res) => {
  const bills = db.findAll('bills', b => b.user_id === req.userId && b.is_active === 1).sort((a, b) => a.due_date.localeCompare(b.due_date));
  res.json(bills);
});

router.post('/bills', authMiddleware, (req, res) => {
  const { name, amount, due_date, frequency, category, notes, auto_pay } = req.body;
  const result = db.insert('bills', { user_id: req.userId, name, amount, due_date, frequency: frequency || 'monthly', category: category || 'Utilities', notes: notes || '', auto_pay: auto_pay ? 1 : 0, is_paid: 0, is_active: 1 });
  res.json({ id: result.lastInsertRowid });
});

router.patch('/bills/:id/paid', authMiddleware, (req, res) => {
  db.update('bills', b => b.id === parseInt(req.params.id) && b.user_id === req.userId, { is_paid: 1, paid_at: new Date().toISOString() });
  res.json({ success: true });
});

router.patch('/bills/:id', authMiddleware, (req, res) => {
  const { name, amount, due_date, frequency, category } = req.body;
  const updates = {};
  if (name) updates.name = name;
  if (amount) updates.amount = amount;
  if (due_date) updates.due_date = due_date;
  if (frequency) updates.frequency = frequency;
  if (category) updates.category = category;
  db.update('bills', b => b.id === parseInt(req.params.id) && b.user_id === req.userId, updates);
  res.json({ success: true });
});

router.delete('/bills/:id', authMiddleware, (req, res) => {
  db.update('bills', b => b.id === parseInt(req.params.id) && b.user_id === req.userId, { is_active: 0 });
  res.json({ success: true });
});

// ==================== SHOPPING LISTS ====================
router.get('/shopping-lists', authMiddleware, (req, res) => {
  const lists = db.findAll('shopping_lists', l => l.user_id === req.userId && l.is_active !== 0).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const enhanced = lists.map(l => {
    const items = db.findAll('shopping_list_items', i => i.list_id === l.id);
    const checkedCount = items.filter(i => i.is_checked).length;
    return { ...l, items, item_count: items.length, checked_count: checkedCount, total_estimate: items.reduce((s, i) => s + (i.estimated_price || 0) * (i.quantity || 1), 0) };
  });
  res.json(enhanced);
});

router.post('/shopping-lists', authMiddleware, (req, res) => {
  const { name, store, budget } = req.body;
  const result = db.insert('shopping_lists', { user_id: req.userId, name: name || 'My List', store: store || '', budget: budget || 0, is_active: 1 });
  res.json({ id: result.lastInsertRowid });
});

router.post('/shopping-lists/:id/items', authMiddleware, (req, res) => {
  const { name, quantity, unit, estimated_price, category, notes, priority } = req.body;
  const result = db.insert('shopping_list_items', { list_id: parseInt(req.params.id), name, quantity: quantity || 1, unit: unit || '', estimated_price: estimated_price || 0, category: category || '', notes: notes || '', priority: priority || 'normal', is_checked: 0 });
  res.json({ id: result.lastInsertRowid });
});

router.patch('/shopping-lists/:listId/items/:itemId/toggle', authMiddleware, (req, res) => {
  const item = db.findOne('shopping_list_items', i => i.id === parseInt(req.params.itemId));
  if (item) db.update('shopping_list_items', i => i.id === item.id, { is_checked: item.is_checked ? 0 : 1 });
  res.json({ success: true });
});

router.delete('/shopping-lists/:listId/items/:itemId', authMiddleware, (req, res) => {
  db.delete('shopping_list_items', i => i.id === parseInt(req.params.itemId));
  res.json({ success: true });
});

router.delete('/shopping-lists/:id', authMiddleware, (req, res) => {
  db.update('shopping_lists', l => l.id === parseInt(req.params.id) && l.user_id === req.userId, { is_active: 0 });
  res.json({ success: true });
});

// ==================== NOTES / JOURNAL ====================
router.get('/notes', authMiddleware, (req, res) => {
  const notes = db.findAll('notes', n => n.user_id === req.userId && n.is_active !== 0).sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at));
  res.json(notes);
});

router.post('/notes', authMiddleware, (req, res) => {
  const { title, content, category, color, is_pinned } = req.body;
  const result = db.insert('notes', { user_id: req.userId, title: title || 'Untitled', content: content || '', category: category || 'General', color: color || '#3b82f6', is_pinned: is_pinned ? 1 : 0, is_active: 1, updated_at: new Date().toISOString() });
  res.json({ id: result.lastInsertRowid });
});

router.patch('/notes/:id', authMiddleware, (req, res) => {
  const { title, content, category, color, is_pinned } = req.body;
  const updates = { updated_at: new Date().toISOString() };
  if (title !== undefined) updates.title = title;
  if (content !== undefined) updates.content = content;
  if (category !== undefined) updates.category = category;
  if (color !== undefined) updates.color = color;
  if (is_pinned !== undefined) updates.is_pinned = is_pinned ? 1 : 0;
  db.update('notes', n => n.id === parseInt(req.params.id) && n.user_id === req.userId, updates);
  res.json({ success: true });
});

router.delete('/notes/:id', authMiddleware, (req, res) => {
  db.update('notes', n => n.id === parseInt(req.params.id) && n.user_id === req.userId, { is_active: 0 });
  res.json({ success: true });
});

// ==================== NET WORTH ====================
router.get('/networth', authMiddleware, (req, res) => {
  const entries = db.findAll('networth_entries', e => e.user_id === req.userId).sort((a, b) => a.date.localeCompare(b.date));
  const latest = entries[entries.length - 1];
  res.json({ entries, latest, total_assets: latest ? latest.assets : 0, total_liabilities: latest ? latest.liabilities : 0, net_worth: latest ? latest.assets - latest.liabilities : 0 });
});

router.post('/networth', authMiddleware, (req, res) => {
  const { assets, liabilities, date, notes } = req.body;
  const result = db.insert('networth_entries', { user_id: req.userId, assets: assets || 0, liabilities: liabilities || 0, date: date || new Date().toISOString().split('T')[0], notes: notes || '' });
  res.json({ id: result.lastInsertRowid, net_worth: (assets || 0) - (liabilities || 0) });
});

// ==================== DEBT TRACKER ====================
router.get('/debts', authMiddleware, (req, res) => {
  const debts = db.findAll('debts', d => d.user_id === req.userId && d.is_active !== 0).sort((a, b) => b.interest_rate - a.interest_rate);
  const totalDebt = debts.reduce((s, d) => s + d.remaining_balance, 0);
  const totalMinPayment = debts.reduce((s, d) => s + (d.min_payment || 0), 0);
  res.json({ debts, total_debt: totalDebt, total_min_payment: totalMinPayment });
});

router.post('/debts', authMiddleware, (req, res) => {
  const { name, type, original_balance, remaining_balance, interest_rate, min_payment, due_date } = req.body;
  const result = db.insert('debts', { user_id: req.userId, name, type: type || 'other', original_balance: original_balance || 0, remaining_balance: remaining_balance || 0, interest_rate: interest_rate || 0, min_payment: min_payment || 0, due_date: due_date || '', is_active: 1 });
  res.json({ id: result.lastInsertRowid });
});

router.post('/debts/:id/payment', authMiddleware, (req, res) => {
  const { amount } = req.body;
  const debt = db.findOne('debts', d => d.id === parseInt(req.params.id) && d.user_id === req.userId);
  if (!debt) return res.status(404).json({ error: 'Not found' });
  const newBalance = Math.max(0, debt.remaining_balance - amount);
  db.update('debts', d => d.id === debt.id, { remaining_balance: newBalance });
  db.insert('debt_payments', { debt_id: debt.id, user_id: req.userId, amount, date: new Date().toISOString() });
  if (newBalance === 0) {
    db.insert('notifications', { user_id: req.userId, type: 'achievement', title: `🎉 Debt Paid Off: ${debt.name}`, message: `You paid off ${debt.name}!`, is_read: 0, icon: '🎉', priority: 'high' });
  }
  res.json({ success: true, new_balance: newBalance });
});

router.delete('/debts/:id', authMiddleware, (req, res) => {
  db.update('debts', d => d.id === parseInt(req.params.id) && d.user_id === req.userId, { is_active: 0 });
  res.json({ success: true });
});

// ==================== RECURRING EXPENSES ====================
router.get('/recurring', authMiddleware, (req, res) => {
  const items = db.findAll('recurring_expenses', r => r.user_id === req.userId && r.is_active !== 0).sort((a, b) => b.amount - a.amount);
  const totalMonthly = items.reduce((s, r) => {
    if (r.frequency === 'weekly') return s + r.amount * 4.33;
    if (r.frequency === 'yearly') return s + r.amount / 12;
    return s + r.amount;
  }, 0);
  res.json({ items, total_monthly: totalMonthly, total_yearly: totalMonthly * 12 });
});

router.post('/recurring', authMiddleware, (req, res) => {
  const { name, amount, frequency, category, next_date, notes } = req.body;
  const result = db.insert('recurring_expenses', { user_id: req.userId, name, amount, frequency: frequency || 'monthly', category: category || 'Other', next_date: next_date || '', notes: notes || '', is_active: 1 });
  res.json({ id: result.lastInsertRowid });
});

router.delete('/recurring/:id', authMiddleware, (req, res) => {
  db.update('recurring_expenses', r => r.id === parseInt(req.params.id) && r.user_id === req.userId, { is_active: 0 });
  res.json({ success: true });
});

// ==================== GAMIFICATION ====================
router.get('/gamification', authMiddleware, (req, res) => {
  const user = db.findOne('users', u => u.id === req.userId);
  const achievements = db.findAll('user_achievements', a => a.user_id === req.userId);
  const allAchievements = getAchievementDefinitions();
  const unlockedIds = new Set(achievements.map(a => a.achievement_id));
  const achievementsWithStatus = allAchievements.map(a => ({ ...a, unlocked: unlockedIds.has(a.id), unlocked_at: achievements.find(ua => ua.achievement_id === a.id)?.unlocked_at || null }));
  const challenges = db.findAll('user_challenges', c => c.user_id === req.userId).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 10);
  const dailyChallenge = generateChallenge('daily');
  const weeklyChallenge = generateChallenge('weekly');
  res.json({
    xp: user.xp || 0, level: user.level || 1, streak: user.streak || 0, best_streak: user.best_streak || 0,
    reputation: user.reputation || 0, next_level_xp: ((user.level || 1)) * 100,
    achievements: achievementsWithStatus, unlocked_count: unlockedIds.size, total_achievements: allAchievements.length,
    challenges, daily_challenge: dailyChallenge, weekly_challenge: weeklyChallenge
  });
});

router.post('/gamification/challenge/accept', authMiddleware, (req, res) => {
  const { name, description, xp, type, icon } = req.body;
  const result = db.insert('user_challenges', { user_id: req.userId, name, description, xp: xp || 50, type: type || 'daily', icon: icon || '🎯', status: 'active', accepted_at: new Date().toISOString() });
  res.json({ id: result.lastInsertRowid });
});

router.patch('/gamification/challenge/:id/complete', authMiddleware, (req, res) => {
  const challenge = db.findOne('user_challenges', c => c.id === parseInt(req.params.id) && c.user_id === req.userId);
  if (!challenge) return res.status(404).json({ error: 'Not found' });
  db.update('user_challenges', c => c.id === challenge.id, { status: 'completed', completed_at: new Date().toISOString() });
  // Grant XP
  const user = db.findOne('users', u => u.id === req.userId);
  const newXp = (user.xp || 0) + (challenge.xp || 50);
  const newLevel = Math.floor(newXp / 100) + 1;
  db.update('users', u => u.id === req.userId, { xp: newXp, level: newLevel });
  if (newLevel > (user.level || 1)) {
    db.insert('notifications', { user_id: req.userId, type: 'level_up', title: `🎉 Level Up!`, message: `You reached Level ${newLevel}!`, is_read: 0, icon: '⬆️', priority: 'medium' });
  }
  res.json({ success: true, xp_earned: challenge.xp, new_xp: newXp, new_level: newLevel });
});

// ==================== FINANCIAL HEALTH ====================
router.get('/financial-health', authMiddleware, async (req, res) => {
  try {
    const user = db.findOne('users', u => u.id === req.userId);
    const cutoff = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
    const spending = db.findAll('spending_tracker', s => s.user_id === req.userId && s.date >= cutoff);
    const budgets = db.findAll('budgets', b => b.user_id === req.userId);
    const savings = db.findAll('savings_goals', g => g.user_id === req.userId && g.is_active === 1);
    const debts = db.findAll('debts', d => d.user_id === req.userId && d.is_active !== 0);
    const totalSpending = spending.reduce((s, e) => s + e.amount, 0);
    const totalSaved = savings.reduce((s, g) => s + (g.current_amount || 0), 0);
    const totalDebt = debts.reduce((s, d) => s + d.remaining_balance, 0);
    const userData = { spending: totalSpending, savings: totalSaved, debt: totalDebt, budgets: budgets.length, income: user.income || 0, contributions: user.total_contributions || 0 };
    const health = await calculateFinancialHealth(userData);
    // Save score
    db.update('users', u => u.id === req.userId, { financial_health_score: health.overall_score });
    res.json(health);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== RECEIPT SCANNING ====================
router.post('/receipt/analyze', authMiddleware, async (req, res) => {
  try {
    const { receipt_text } = req.body;
    if (!receipt_text) return res.status(400).json({ error: 'Receipt text required' });
    const analysis = await analyzeReceipt(receipt_text);
    res.json(analysis);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== DAILY TIP ====================
router.get('/daily-tip', (req, res) => {
  res.json(getDailyTip());
});

// ==================== FINANCIAL QUIZ ====================
router.get('/quiz', authMiddleware, (req, res) => {
  res.json(generateFinancialQuiz());
});

router.post('/quiz/submit', authMiddleware, (req, res) => {
  const { score, total } = req.body;
  const xpEarned = score * 20;
  const user = db.findOne('users', u => u.id === req.userId);
  db.update('users', u => u.id === req.userId, { xp: (user.xp || 0) + xpEarned });
  db.insert('quiz_results', { user_id: req.userId, score, total, xp_earned: xpEarned });
  res.json({ xp_earned: xpEarned, new_xp: (user.xp || 0) + xpEarned });
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

router.patch('/notifications/:id/read', authMiddleware, (req, res) => {
  db.update('notifications', n => n.id === parseInt(req.params.id) && n.user_id === req.userId, { is_read: 1 });
  res.json({ success: true });
});

router.delete('/notifications/:id', authMiddleware, (req, res) => {
  db.delete('notifications', n => n.id === parseInt(req.params.id) && n.user_id === req.userId);
  res.json({ success: true });
});

// ==================== STORES ====================
router.get('/stores', authMiddleware, (req, res) => {
  const entries = db.findAll('price_entries');
  const storeMap = {};
  for (const e of entries) {
    if (!e.store_name) continue;
    if (!storeMap[e.store_name]) storeMap[e.store_name] = { name: e.store_name, cities: new Set(), entry_count: 0, scores: [] };
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
  const totalSaved = db.findAll('savings_goals').reduce((s, g) => s + (g.current_amount || 0), 0);
  const topCategories = {};
  const entries = db.findAll('price_entries');
  const products = db.findAll('products');
  const categories = db.findAll('categories');
  for (const e of entries) { const p = products.find(pr => pr.id === e.product_id); const c = p ? categories.find(cat => cat.id === p.category_id) : null; if (c) topCategories[c.name] = (topCategories[c.name] || 0) + 1; }
  res.json({ total_users: totalUsers, total_prices: totalPrices, total_products: totalProducts, weekly_prices: weeklyPrices, total_saved: totalSaved, top_categories: Object.entries(topCategories).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count]) => ({ name, count })) });
});

router.get('/community/leaderboard', (req, res) => {
  const users = db.findAll('users').sort((a, b) => (b.total_contributions || 0) - (a.total_contributions || 0)).slice(0, 20).map(u => ({ id: u.id, name: u.name, city: u.city, contributions: u.total_contributions || 0, reputation: u.reputation || 0, avatar_color: u.avatar_color || '#3b82f6', avatar_emoji: u.avatar_emoji || '😀', level: u.level || 1, xp: u.xp || 0, streak: u.streak || 0, joined: u.joined_at || u.created_at }));
  res.json(users);
});

router.get('/community/feed', (req, res) => {
  const recentPrices = db.findAll('price_entries').sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 20);
  const products = db.findAll('products');
  const categories = db.findAll('categories');
  const feed = recentPrices.map(pe => {
    const pr = products.find(p => p.id === pe.product_id);
    const cat = pr ? categories.find(c => c.id === pr.category_id) : null;
    const user = db.findOne('users', u => u.id === pe.user_id);
    return { type: 'price_added', product_name: pr?.name || '', price: pe.price, store: pe.store_name, city: pe.city, icon: cat?.icon || '📦', user_name: user?.name || 'Anonymous', user_avatar_color: user?.avatar_color || '#3b82f6', ai_score: pe.ai_score, ai_rating: pe.ai_rating, created_at: pe.created_at };
  });
  res.json(feed);
});

// ==================== EXPORT ====================
router.get('/export/prices', authMiddleware, (req, res) => {
  const entries = db.findAll('price_entries', pe => pe.user_id === req.userId);
  const products = db.findAll('products');
  const data = entries.map(e => { const p = products.find(pr => pr.id === e.product_id); return { product: p?.name || '', price: e.price, store: e.store_name, city: e.city, date: e.created_at, is_sale: e.is_sale ? 'Yes' : 'No', notes: e.notes, ai_score: e.ai_score, ai_rating: e.ai_rating }; });
  res.json(data);
});

router.get('/export/spending', authMiddleware, (req, res) => {
  const spending = db.findAll('spending_tracker', s => s.user_id === req.userId).sort((a, b) => b.date.localeCompare(a.date));
  res.json(spending);
});

router.get('/export/all', authMiddleware, (req, res) => {
  const priceEntries = db.findAll('price_entries', pe => pe.user_id === req.userId);
  const spending = db.findAll('spending_tracker', s => s.user_id === req.userId);
  const budgets = db.findAll('budgets', b => b.user_id === req.userId);
  const savings = db.findAll('savings_goals', g => g.user_id === req.userId);
  const bills = db.findAll('bills', b => b.user_id === req.userId);
  const notes = db.findAll('notes', n => n.user_id === req.userId);
  res.json({ prices: priceEntries, spending, budgets, savings, bills, notes, exported_at: new Date().toISOString() });
});

// ==================== FEEDBACK ====================
router.post('/feedback', authMiddleware, (req, res) => {
  const { type, message, rating } = req.body;
  db.insert('feedback', { user_id: req.userId, type: type || 'general', message, rating: rating || 0 });
  // XP for feedback
  const user = db.findOne('users', u => u.id === req.userId);
  db.update('users', u => u.id === req.userId, { xp: (user.xp || 0) + 10 });
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
  const catMap = {};
  for (const e of myEntries) { const p = products.find(pr => pr.id === e.product_id); const c = p ? categories.find(cat => cat.id === p.category_id) : null; const catName = c?.name || 'Other'; if (!catMap[catName]) catMap[catName] = { name: catName, icon: c?.icon || '📦', count: 0, total_spent: 0, scores: [] }; catMap[catName].count++; catMap[catName].total_spent += e.price; if (e.ai_score) catMap[catName].scores.push(e.ai_score); }
  const categoryBreakdown = Object.values(catMap).sort((a, b) => b.count - a.count).map(c => ({ ...c, avg_score: c.scores.length ? Math.round(c.scores.reduce((a, b) => a + b, 0) / c.scores.length) : 0 }));
  const monthMap = {};
  for (const e of myEntries) { const month = e.created_at.slice(0, 7); if (!monthMap[month]) monthMap[month] = { month, count: 0, total: 0 }; monthMap[month].count++; monthMap[month].total += e.price; }
  const monthlyTrends = Object.values(monthMap).sort((a, b) => a.month.localeCompare(b.month));
  const storeMap = {};
  for (const e of myEntries) { if (!e.store_name) continue; if (!storeMap[e.store_name]) storeMap[e.store_name] = { store: e.store_name, count: 0, scores: [] }; storeMap[e.store_name].count++; if (e.ai_score) storeMap[e.store_name].scores.push(e.ai_score); }
  const topStores = Object.values(storeMap).map(s => ({ ...s, avg_score: s.scores.length ? Math.round(s.scores.reduce((a, b) => a + b, 0) / s.scores.length) : 50 })).sort((a, b) => b.count - a.count).slice(0, 10);
  const spending = db.findAll('spending_tracker', s => s.user_id === req.userId);
  const totalSpending = spending.reduce((s, e) => s + e.amount, 0);
  // Hour distribution
  const hourMap = {};
  for (const e of myEntries) { const hour = new Date(e.created_at).getHours(); if (!hourMap[hour]) hourMap[hour] = 0; hourMap[hour]++; }
  // Day distribution
  const dayMap = {};
  for (const e of myEntries) { const day = new Date(e.created_at).toLocaleDateString('en', { weekday: 'short' }); if (!dayMap[day]) dayMap[day] = 0; dayMap[day]++; }
  const user = db.findOne('users', u => u.id === req.userId);
  res.json({ total_entries: myEntries.length, total_products_tracked: new Set(myEntries.map(e => e.product_id)).size, category_breakdown: categoryBreakdown, monthly_trends: monthlyTrends, top_stores: topStores, total_spending: totalSpending, hour_distribution: hourMap, day_distribution: dayMap, avg_deal_score: myEntries.length ? Math.round(myEntries.filter(e => e.ai_score).reduce((s, e) => s + e.ai_score, 0) / myEntries.filter(e => e.ai_score).length) : 0, financial_health_score: user?.financial_health_score || 50 });
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

// ==================== CURRENCY CONVERTER ====================
router.get('/currency/rates', (req, res) => {
  // Static fallback rates
  const rates = { USD: 1, EUR: 0.92, GBP: 0.79, INR: 83.12, JPY: 149.50, CAD: 1.36, AUD: 1.53, CHF: 0.88, CNY: 7.24, MXN: 17.15, BRL: 4.97, KRW: 1328.50, SGD: 1.34, HKD: 7.82, SEK: 10.42, NOK: 10.52, DKK: 6.87, NZD: 1.63, ZAR: 18.92, TRY: 30.25, THB: 35.50, PHP: 56.20, PLN: 4.02, CZK: 22.85, HUF: 355.50, ILS: 3.65, AED: 3.67, SAR: 3.75, MYR: 4.72, TWD: 31.50, RUB: 92.50 };
  res.json(rates);
});

// ==================== CALCULATOR TOOLS ====================
router.post('/tools/tip-calculator', (req, res) => {
  const { bill_amount, tip_percent, split_ways } = req.body;
  const tip = bill_amount * (tip_percent / 100);
  const total = bill_amount + tip;
  const perPerson = split_ways > 1 ? total / split_ways : total;
  const tipPerPerson = split_ways > 1 ? tip / split_ways : tip;
  res.json({ bill_amount, tip_percent, tip_amount: tip, total, split_ways: split_ways || 1, per_person: perPerson, tip_per_person: tipPerPerson });
});

router.post('/tools/loan-calculator', (req, res) => {
  const { principal, annual_rate, years } = req.body;
  const monthlyRate = annual_rate / 100 / 12;
  const months = years * 12;
  const payment = monthlyRate > 0 ? principal * (monthlyRate * Math.pow(1 + monthlyRate, months)) / (Math.pow(1 + monthlyRate, months) - 1) : principal / months;
  const totalPaid = payment * months;
  const totalInterest = totalPaid - principal;
  res.json({ monthly_payment: Math.round(payment * 100) / 100, total_paid: Math.round(totalPaid * 100) / 100, total_interest: Math.round(totalInterest * 100) / 100, months });
});

router.post('/tools/savings-calculator', (req, res) => {
  const { initial, monthly, annual_rate, years } = req.body;
  const monthlyRate = (annual_rate || 0) / 100 / 12;
  const months = (years || 1) * 12;
  let balance = initial || 0;
  const timeline = [];
  for (let i = 1; i <= months; i++) {
    balance = balance * (1 + monthlyRate) + (monthly || 0);
    if (i % 12 === 0 || i === months) timeline.push({ month: i, balance: Math.round(balance * 100) / 100 });
  }
  const totalContributed = (initial || 0) + (monthly || 0) * months;
  res.json({ final_balance: Math.round(balance * 100) / 100, total_contributed: totalContributed, total_interest_earned: Math.round((balance - totalContributed) * 100) / 100, timeline });
});

router.post('/tools/discount-calculator', (req, res) => {
  const { original_price, discount_percent, tax_percent } = req.body;
  const discount = original_price * (discount_percent / 100);
  const discounted = original_price - discount;
  const tax = discounted * ((tax_percent || 0) / 100);
  const final_price = discounted + tax;
  res.json({ original_price, discount_percent, discount_amount: discount, price_after_discount: discounted, tax_amount: tax, final_price });
});

router.post('/tools/unit-price', (req, res) => {
  const items = req.body.items || [];
  const results = items.map(item => ({
    ...item,
    unit_price: item.quantity > 0 ? item.price / item.quantity : 0,
    best_value: false
  }));
  if (results.length > 0) {
    const best = results.reduce((min, item) => item.unit_price < min.unit_price && item.unit_price > 0 ? item : min, results[0]);
    best.best_value = true;
  }
  res.json(results);
});

// ==================== PANTRY / INVENTORY ====================
router.get('/pantry', authMiddleware, (req, res) => {
  const items = db.findAll('pantry_items', i => i.user_id === req.userId && i.is_active !== 0).sort((a, b) => {
    if (a.expiry_date && b.expiry_date) return a.expiry_date.localeCompare(b.expiry_date);
    return a.expiry_date ? -1 : 1;
  });
  const expiring = items.filter(i => i.expiry_date && new Date(i.expiry_date) <= new Date(Date.now() + 7 * 86400000));
  res.json({ items, expiring_soon: expiring, total_items: items.length });
});

router.post('/pantry', authMiddleware, (req, res) => {
  const { name, quantity, unit, category, expiry_date, purchase_price, store } = req.body;
  const result = db.insert('pantry_items', { user_id: req.userId, name, quantity: quantity || 1, unit: unit || '', category: category || 'Other', expiry_date: expiry_date || '', purchase_price: purchase_price || 0, store: store || '', is_active: 1 });
  res.json({ id: result.lastInsertRowid });
});

router.patch('/pantry/:id', authMiddleware, (req, res) => {
  const { quantity, expiry_date } = req.body;
  const updates = {};
  if (quantity !== undefined) updates.quantity = quantity;
  if (expiry_date !== undefined) updates.expiry_date = expiry_date;
  db.update('pantry_items', i => i.id === parseInt(req.params.id) && i.user_id === req.userId, updates);
  res.json({ success: true });
});

router.delete('/pantry/:id', authMiddleware, (req, res) => {
  db.update('pantry_items', i => i.id === parseInt(req.params.id) && i.user_id === req.userId, { is_active: 0 });
  res.json({ success: true });
});

// ==================== COUPONS ====================
router.get('/coupons', authMiddleware, (req, res) => {
  const coupons = db.findAll('coupons', c => c.user_id === req.userId && c.is_active !== 0).sort((a, b) => (a.expiry_date || 'z').localeCompare(b.expiry_date || 'z'));
  res.json(coupons);
});

router.post('/coupons', authMiddleware, (req, res) => {
  const { code, store, discount_type, discount_value, expiry_date, description, min_purchase } = req.body;
  const result = db.insert('coupons', { user_id: req.userId, code: code || '', store: store || '', discount_type: discount_type || 'percent', discount_value: discount_value || 0, expiry_date: expiry_date || '', description: description || '', min_purchase: min_purchase || 0, is_active: 1, times_used: 0 });
  res.json({ id: result.lastInsertRowid });
});

router.patch('/coupons/:id/use', authMiddleware, (req, res) => {
  const coupon = db.findOne('coupons', c => c.id === parseInt(req.params.id));
  if (coupon) db.update('coupons', c => c.id === coupon.id, { times_used: (coupon.times_used || 0) + 1 });
  res.json({ success: true });
});

router.delete('/coupons/:id', authMiddleware, (req, res) => {
  db.update('coupons', c => c.id === parseInt(req.params.id) && c.user_id === req.userId, { is_active: 0 });
  res.json({ success: true });
});

// ==================== WARRANTIES ====================
router.get('/warranties', authMiddleware, (req, res) => {
  const warranties = db.findAll('warranties', w => w.user_id === req.userId && w.is_active !== 0).sort((a, b) => (a.expiry_date || 'z').localeCompare(b.expiry_date || 'z'));
  const expiring = warranties.filter(w => w.expiry_date && new Date(w.expiry_date) <= new Date(Date.now() + 30 * 86400000) && new Date(w.expiry_date) > new Date());
  res.json({ warranties, expiring_soon: expiring });
});

router.post('/warranties', authMiddleware, (req, res) => {
  const { product_name, store, purchase_date, expiry_date, receipt_ref, notes } = req.body;
  const result = db.insert('warranties', { user_id: req.userId, product_name, store: store || '', purchase_date: purchase_date || '', expiry_date: expiry_date || '', receipt_ref: receipt_ref || '', notes: notes || '', is_active: 1 });
  res.json({ id: result.lastInsertRowid });
});

router.delete('/warranties/:id', authMiddleware, (req, res) => {
  db.update('warranties', w => w.id === parseInt(req.params.id) && w.user_id === req.userId, { is_active: 0 });
  res.json({ success: true });
});

// ==================== WISHLISTS ====================
router.get('/wishlist', authMiddleware, (req, res) => {
  const items = db.findAll('wishlists', w => w.user_id === req.userId && w.is_active !== 0).sort((a, b) => (b.priority || 0) - (a.priority || 0));
  res.json(items);
});

router.post('/wishlist', authMiddleware, (req, res) => {
  const { name, estimated_price, category, priority, notes, url } = req.body;
  const result = db.insert('wishlists', { user_id: req.userId, name, estimated_price: estimated_price || 0, category: category || 'Other', priority: priority || 1, notes: notes || '', url: url || '', is_purchased: 0, is_active: 1 });
  res.json({ id: result.lastInsertRowid });
});

router.patch('/wishlist/:id/purchased', authMiddleware, (req, res) => {
  db.update('wishlists', w => w.id === parseInt(req.params.id) && w.user_id === req.userId, { is_purchased: 1, purchased_at: new Date().toISOString() });
  res.json({ success: true });
});

router.delete('/wishlist/:id', authMiddleware, (req, res) => {
  db.update('wishlists', w => w.id === parseInt(req.params.id) && w.user_id === req.userId, { is_active: 0 });
  res.json({ success: true });
});

// ==================== DASHBOARD ====================
router.get('/dashboard', authMiddleware, (req, res) => {
  const user = db.findOne('users', u => u.id === req.userId);
  if (!user) return res.status(404).json({ error: 'Not found' });
  const { password, ...safeUser } = user;
  const recentPrices = db.findAll('price_entries', pe => pe.user_id === req.userId).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 10).map(pe => { const pr = db.findOne('products', p => p.id === pe.product_id); const cat = pr ? db.findOne('categories', c => c.id === pr.category_id) : null; return { ...pe, product_name: pr?.name || '', icon: cat?.icon || '' }; });
  const totalContributions = db.count('price_entries', pe => pe.user_id === req.userId);
  const activeAlerts = db.count('price_alerts', a => a.user_id === req.userId && a.is_active === 1);
  const triggeredAlerts = db.findAll('price_alerts', a => a.user_id === req.userId && a.triggered === 1 && a.is_active === 1).map(a => { const product = db.findOne('products', p => p.id === a.product_id); return { ...a, product_name: a.product_name || product?.name || '' }; });
  const cutoff = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
  const monthlySpend = db.sum('spending_tracker', 'amount', s => s.user_id === req.userId && s.date >= cutoff);
  const budgets = db.findAll('budgets', b => b.user_id === req.userId);
  const budgetOverview = budgets.map(b => { const spent = db.findAll('spending_tracker', s => s.user_id === req.userId && s.category === b.category && s.date >= cutoff).reduce((s, e) => s + e.amount, 0); return { category: b.category, budget: b.amount, spent, pct: b.amount > 0 ? Math.round(spent / b.amount * 100) : 0 }; });
  const savings = db.findAll('savings_goals', g => g.user_id === req.userId && g.is_active === 1);
  const totalSaved = savings.reduce((s, g) => s + (g.current_amount || 0), 0);
  const today = new Date().toISOString().split('T')[0];
  const upcomingBills = db.findAll('bills', b => b.user_id === req.userId && b.is_active === 1 && !b.is_paid && b.due_date >= today).sort((a, b) => a.due_date.localeCompare(b.due_date)).slice(0, 5);
  const unreadNotifications = db.count('notifications', n => n.user_id === req.userId && !n.is_read);
  const watchlistCount = db.count('watchlist', w => w.user_id === req.userId);
  const recentDeals = db.findAll('price_entries', pe => pe.ai_score >= 70).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5).map(pe => { const pr = db.findOne('products', p => p.id === pe.product_id); const cat = pr ? db.findOne('categories', c => c.id === pr.category_id) : null; return { product_name: pr?.name || '', price: pe.price, score: pe.ai_score, icon: cat?.icon || '📦', store: pe.store_name }; });
  const dailyTip = getDailyTip();
  // Spending comparison
  const lastMonth = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).toISOString().slice(0, 7);
  const lastMonthSpend = db.findAll('spending_tracker', s => s.user_id === req.userId && s.date.startsWith(lastMonth)).reduce((s, e) => s + e.amount, 0);
  const spendChange = lastMonthSpend > 0 ? Math.round(((monthlySpend - lastMonthSpend) / lastMonthSpend) * 100) : 0;
  // Shopping lists count
  const shoppingListsCount = db.count('shopping_lists', l => l.user_id === req.userId && l.is_active !== 0);
  // Debts
  const totalDebt = db.findAll('debts', d => d.user_id === req.userId && d.is_active !== 0).reduce((s, d) => s + d.remaining_balance, 0);

  res.json({
    user: safeUser, recent_prices: recentPrices, total_contributions: totalContributions,
    active_alerts: activeAlerts, triggered_alerts: triggeredAlerts,
    monthly_spend: monthlySpend || 0, budget_overview: budgetOverview,
    savings: { goals: savings, total_saved: totalSaved },
    upcoming_bills: upcomingBills, unread_notifications: unreadNotifications,
    watchlist_count: watchlistCount, recent_deals: recentDeals,
    daily_tip: dailyTip, spend_change: spendChange, last_month_spend: lastMonthSpend,
    shopping_lists_count: shoppingListsCount, total_debt: totalDebt,
    xp: user.xp || 0, level: user.level || 1, streak: user.streak || 0,
    financial_health_score: user.financial_health_score || 50
  });
});

// ==================== FESTIVAL / OFFER AWARENESS ====================
function getFestivalsData() {
  const year = new Date().getFullYear();
  const today = new Date(); today.setHours(0,0,0,0);
  const festivals = [
    { name: 'Pongal / Makar Sankranti', date: `${year}-01-14`, icon: '🌾', region: 'South India', typical_discount_pct: 20, categories: ['Groceries','Clothing','Electronics'], advice: 'Buy rice, jaggery, sweets in bulk. Clothing & ethnic wear deals peak around Pongal.', color: '#f59e0b', tags: ['harvest','india'] },
    { name: 'Republic Day Sale', date: `${year}-01-26`, icon: '🇮🇳', region: 'India', typical_discount_pct: 30, categories: ['Electronics','Clothing','Appliances'], advice: 'Major e-commerce flash sales. Best time for smartphones and large appliances.', color: '#3b82f6', tags: ['national','india'] },
    { name: "Valentine's Day", date: `${year}-02-14`, icon: '💝', region: 'Global', typical_discount_pct: 15, categories: ['Jewelry','Gifts','Food & Dining'], advice: 'Chocolates and dining packages surge. Buy gifts 1 week early to avoid premium pricing.', color: '#ef4444', tags: ['gifts','global'] },
    { name: 'Holi', date: `${year}-03-14`, icon: '🎨', region: 'India', typical_discount_pct: 20, categories: ['Clothing','Groceries','Home & Garden'], advice: 'Festival of colors — expect deals on clothing and home decor. Buy colors early.', color: '#8b5cf6', tags: ['festival','india'] },
    { name: 'Ugadi / Gudi Padwa', date: `${year}-03-30`, icon: '🌟', region: 'India', typical_discount_pct: 18, categories: ['Clothing','Jewelry','Electronics'], advice: 'Telugu/Kannada/Marathi New Year. Good deals on jewelry and auspicious purchases.', color: '#10b981', tags: ['newyear','india'] },
    { name: "Eid al-Fitr", date: `${year}-04-01`, icon: '🌙', region: 'India / Global', typical_discount_pct: 20, categories: ['Clothing','Food & Dining','Jewelry'], advice: 'Great deals on clothing, sweets, and gifts. Plan purchases 1 week ahead of Eid.', color: '#06b6d4', tags: ['festival','global'] },
    { name: "Mother's Day", date: `${year}-05-11`, icon: '💐', region: 'Global', typical_discount_pct: 15, categories: ['Gifts','Jewelry','Health & Beauty'], advice: 'Flowers and gift sets are marked up. Consider experiences or order online for savings.', color: '#ec4899', tags: ['gifts','global'] },
    { name: 'Raksha Bandhan', date: `${year}-08-09`, icon: '🎀', region: 'India', typical_discount_pct: 15, categories: ['Gifts','Jewelry','Sweets'], advice: 'Gift hampers and chocolates surge. Order rakhi combos 2 weeks early at lower prices.', color: '#f59e0b', tags: ['festival','india'] },
    { name: 'Independence Day (India)', date: `${year}-08-15`, icon: '🇮🇳', region: 'India', typical_discount_pct: 25, categories: ['Electronics','Clothing','Appliances'], advice: 'Huge online sales on Flipkart & Amazon. Best time for electronics and mobiles.', color: '#3b82f6', tags: ['national','india'] },
    { name: 'Onam', date: `${year}-09-05`, icon: '🌸', region: 'Kerala', typical_discount_pct: 20, categories: ['Clothing','Groceries','Jewelry'], advice: "Kerala's harvest festival. Traditional clothing (kasavu sarees) at discounted prices.", color: '#10b981', tags: ['harvest','india'] },
    { name: 'Ganesh Chaturthi', date: `${year}-08-27`, icon: '🐘', region: 'India', typical_discount_pct: 15, categories: ['Groceries','Home & Garden','Clothing'], advice: 'Modak ingredients and sweets peak in price. Buy 1 week before to get better rates.', color: '#f59e0b', tags: ['festival','india'] },
    { name: 'Navratri', date: `${year}-10-02`, icon: '🪔', region: 'India', typical_discount_pct: 25, categories: ['Clothing','Jewelry','Electronics'], advice: 'Big Billion Days sale coincides. Best 9-day deals on electronics and fashion.', color: '#8b5cf6', tags: ['festival','india'] },
    { name: 'Amazon Great Indian Festival', date: `${year}-10-07`, icon: '🛍️', region: 'India', typical_discount_pct: 40, categories: ['Electronics','Appliances','Clothing'], advice: "India's biggest online sale. Stack bank offers. Compare prices 30 days before.", color: '#f59e0b', tags: ['sale','india'] },
    { name: 'Dussehra', date: `${year}-10-12`, icon: '🏹', region: 'India', typical_discount_pct: 22, categories: ['Automotive','Electronics','Clothing'], advice: 'Auspicious day for vehicle purchases. Good deals on gold jewelry and appliances.', color: '#ef4444', tags: ['festival','india'] },
    { name: 'Dhanteras', date: `${year}-10-18`, icon: '🥇', region: 'India', typical_discount_pct: 30, categories: ['Jewelry','Appliances','Automotive'], advice: 'Best day for gold/silver or appliances. Heavy discounts on electronics and cookware.', color: '#d97706', tags: ['festival','india'] },
    { name: 'Diwali', date: `${year}-10-20`, icon: '🪔', region: 'India', typical_discount_pct: 40, categories: ['Electronics','Jewelry','Clothing','Home & Garden'], advice: "India's biggest shopping season. Set price monitors NOW — prices drop 2 weeks before and rise 1 week before Diwali.", color: '#f59e0b', tags: ['festival','india'] },
    { name: "Children's Day", date: `${year}-11-14`, icon: '🎩', region: 'India', typical_discount_pct: 20, categories: ['Toys','Education','Clothing'], advice: "Good deals on kids toys, books, and clothing. Stock up on school supplies.", color: '#06b6d4', tags: ['children','india'] },
    { name: 'Black Friday', date: `${year}-11-28`, icon: '🛒', region: 'Global', typical_discount_pct: 50, categories: ['Electronics','Clothing','Appliances'], advice: "World's largest single-day sale. Set alerts now on electronics. Best for international stores.", color: '#1e1e2e', tags: ['sale','global'] },
    { name: 'Cyber Monday', date: `${year}-12-01`, icon: '💻', region: 'Global', typical_discount_pct: 45, categories: ['Electronics','Software','Subscriptions'], advice: 'Better for digital goods, software licenses, and subscriptions than physical products.', color: '#3b82f6', tags: ['sale','global'] },
    { name: 'Christmas Sale', date: `${year}-12-25`, icon: '🎄', region: 'Global', typical_discount_pct: 35, categories: ['Electronics','Clothing','Gifts'], advice: 'Post-Christmas clearance is even better. Electronics prices drop 15-30% in late December.', color: '#ef4444', tags: ['christmas','global'] },
    { name: 'New Year Sale', date: `${year}-12-31`, icon: '🎆', region: 'Global', typical_discount_pct: 30, categories: ['Electronics','Clothing','Travel'], advice: 'Clearance sales hit hard. Best for fitness equipment, electronics, and travel bookings.', color: '#8b5cf6', tags: ['newyear','global'] },
  ];
  return festivals.map(f => {
    const fDate = new Date(f.date); fDate.setHours(0,0,0,0);
    const daysUntil = Math.ceil((fDate - today) / 86400000);
    return { ...f, days_until: daysUntil, is_upcoming: daysUntil >= 0 && daysUntil <= 90, is_past: daysUntil < 0, is_today: daysUntil === 0 };
  }).sort((a, b) => a.days_until - b.days_until);
}

router.get('/festivals', authMiddleware, (req, res) => {
  res.json(getFestivalsData());
});

// ==================== PRODUCT MONITOR ====================
function generatePriceHistory(basePrice, days, category) {
  const history = [];
  let price = basePrice;
  const vol = ['Electronics','Fuel & Energy'].includes(category) ? 0.05 : ['Groceries','Food & Dining'].includes(category) ? 0.025 : 0.038;
  for (let i = days; i >= 0; i--) {
    const date = new Date(Date.now() - i * 86400000).toISOString().split('T')[0];
    const change = (Math.random() - 0.48) * vol * price;
    price = Math.max(basePrice * 0.55, Math.min(basePrice * 1.55, price + change));
    price = Math.round(price * 100) / 100;
    history.push({ date, price });
  }
  return history;
}

router.get('/monitors', authMiddleware, (req, res) => {
  const monitors = db.findAll('product_monitors', m => m.user_id === req.userId && m.is_active !== 0);
  const enriched = monitors.map(m => {
    const history = db.findAll('monitor_prices', p => p.monitor_id === m.id).sort((a, b) => a.date.localeCompare(b.date));
    const prices = history.map(h => h.price);
    const latestPrice = prices.length ? prices[prices.length - 1] : m.base_price;
    const lowestPrice = prices.length ? Math.min(...prices) : m.base_price;
    const highestPrice = prices.length ? Math.max(...prices) : m.base_price;
    const avgPrice = prices.length ? prices.reduce((s, p) => s + p, 0) / prices.length : m.base_price;
    return { ...m, latest_price: latestPrice, lowest_price: Math.round(lowestPrice * 100) / 100, highest_price: Math.round(highestPrice * 100) / 100, avg_price: Math.round(avgPrice * 100) / 100, history, price_count: history.length, is_at_all_time_low: latestPrice <= lowestPrice, price_change_pct: prices.length >= 2 ? ((prices[prices.length - 1] - prices[0]) / prices[0] * 100).toFixed(1) : '0.0' };
  });
  res.json(enriched);
});

router.post('/monitors', authMiddleware, async (req, res) => {
  try {
    const { product_name, base_price, currency, auto_order, order_quantity, target_price, notes } = req.body;
    if (!product_name) return res.status(400).json({ error: 'Product name required' });
    if (!base_price || isNaN(base_price)) return res.status(400).json({ error: 'Valid base price required' });
    const existing = db.findOne('product_monitors', m => m.user_id === req.userId && m.product_name.toLowerCase() === product_name.toLowerCase() && m.is_active !== 0);
    if (existing) return res.status(400).json({ error: 'Already monitoring this product' });
    const cat = await categorizeProduct(product_name);
    const realCat = cat.category || 'General';
    const computedBase = parseFloat(base_price);
    const computedTarget = parseFloat(target_price) || Math.round(computedBase * 0.9 * 100) / 100;
    const result = db.insert('product_monitors', { user_id: req.userId, product_name, category: realCat, base_price: computedBase, currency: currency || 'INR', auto_order: auto_order ? 1 : 0, order_quantity: parseInt(order_quantity) || 1, target_price: computedTarget, notes: notes || '', last_checked: new Date().toISOString(), is_active: 1 });
    const monitorId = result.lastInsertRowid;
    const history = generatePriceHistory(computedBase, 30, realCat);
    for (const h of history) db.insert('monitor_prices', { monitor_id: monitorId, user_id: req.userId, price: h.price, date: h.date, source: 'simulated' });
    const prices = history.map(h => h.price);
    db.insert('notifications', { user_id: req.userId, type: 'monitor_started', title: `📡 Monitoring: ${product_name}`, message: `Now tracking ${product_name}. Auto-order is ${auto_order ? 'ON (triggers at ' + computedTarget + ')' : 'OFF'}. 30 days of simulated history loaded.`, is_read: 0, icon: '📡', priority: 'medium' });
    res.json({ id: monitorId, product_name, base_price: computedBase, category: realCat, latest_price: prices[prices.length - 1], lowest_price: Math.min(...prices), history_days: history.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/monitors/:id', authMiddleware, (req, res) => {
  const { auto_order, target_price, order_quantity, notes } = req.body;
  const updates = {};
  if (auto_order !== undefined) updates.auto_order = auto_order ? 1 : 0;
  if (target_price !== undefined) updates.target_price = parseFloat(target_price);
  if (order_quantity !== undefined) updates.order_quantity = parseInt(order_quantity);
  if (notes !== undefined) updates.notes = notes;
  db.update('product_monitors', m => m.id === parseInt(req.params.id) && m.user_id === req.userId, updates);
  res.json({ success: true });
});

router.delete('/monitors/:id', authMiddleware, (req, res) => {
  db.update('product_monitors', m => m.id === parseInt(req.params.id) && m.user_id === req.userId, { is_active: 0 });
  res.json({ success: true });
});

router.get('/monitors/:id/history', authMiddleware, (req, res) => {
  const monitorId = parseInt(req.params.id);
  const monitor = db.findOne('product_monitors', m => m.id === monitorId && m.user_id === req.userId);
  if (!monitor) return res.status(404).json({ error: 'Monitor not found' });
  const history = db.findAll('monitor_prices', p => p.monitor_id === monitorId).sort((a, b) => a.date.localeCompare(b.date));
  const prices = history.map(h => h.price);
  const lowestPrice = prices.length ? Math.min(...prices) : monitor.base_price;
  const highestPrice = prices.length ? Math.max(...prices) : monitor.base_price;
  const avgPrice = prices.length ? prices.reduce((s, p) => s + p, 0) / prices.length : monitor.base_price;
  const latestPrice = prices.length ? prices[prices.length - 1] : monitor.base_price;
  res.json({ monitor, history, stats: { latest_price: latestPrice, lowest_price: Math.round(lowestPrice * 100) / 100, highest_price: Math.round(highestPrice * 100) / 100, avg_price: Math.round(avgPrice * 100) / 100, data_points: history.length } });
});

router.post('/monitors/:id/check', authMiddleware, (req, res) => {
  const monitorId = parseInt(req.params.id);
  const monitor = db.findOne('product_monitors', m => m.id === monitorId && m.user_id === req.userId);
  if (!monitor) return res.status(404).json({ error: 'Monitor not found' });
  const history = db.findAll('monitor_prices', p => p.monitor_id === monitorId).sort((a, b) => a.date.localeCompare(b.date));
  const prices = history.map(h => h.price);
  const lastPrice = prices.length ? prices[prices.length - 1] : monitor.base_price;
  const allTimeLow = prices.length ? Math.min(...prices) : lastPrice;
  const vol = 0.04;
  const change = (Math.random() - 0.48) * vol * lastPrice;
  const newPrice = Math.round(Math.max(lastPrice * 0.5, Math.min(lastPrice * 1.5, lastPrice + change)) * 100) / 100;
  const today = new Date().toISOString().split('T')[0];
  db.insert('monitor_prices', { monitor_id: monitorId, user_id: req.userId, price: newPrice, date: today, source: 'checked' });
  db.update('product_monitors', m => m.id === monitorId, { last_checked: new Date().toISOString() });
  const isNewLow = newPrice < allTimeLow;
  const isAtTarget = newPrice <= monitor.target_price;
  let orderTriggered = false; let orderId = null;
  if ((isNewLow || isAtTarget) && monitor.auto_order) {
    const orderResult = db.insert('monitor_orders', { monitor_id: monitorId, user_id: req.userId, product_name: monitor.product_name, triggered_price: newPrice, target_price: monitor.target_price, lowest_ever_price: allTimeLow, quantity: monitor.order_quantity || 1, currency: monitor.currency || 'INR', status: 'pending', trigger_reason: isNewLow ? 'all_time_low' : 'target_reached', ordered_at: new Date().toISOString() });
    orderId = orderResult.lastInsertRowid; orderTriggered = true;
    db.insert('notifications', { user_id: req.userId, type: 'auto_order', title: `🛒 Auto-Order: ${monitor.product_name}`, message: isNewLow ? `All-time low! ₹${newPrice} — Auto-ordered ${monitor.order_quantity || 1} unit(s). Confirm or cancel in Monitor tab.` : `Target price reached! ₹${newPrice} ≤ ₹${monitor.target_price} — Auto-ordered. Confirm in Monitor tab.`, is_read: 0, icon: '📦', priority: 'high', data: JSON.stringify({ monitor_id: monitorId, order_id: orderId, price: newPrice }) });
  } else if (!monitor.auto_order && (isNewLow || isAtTarget)) {
    db.insert('notifications', { user_id: req.userId, type: 'price_drop', title: `📉 ${isNewLow ? 'All-Time Low' : 'Target Hit'}: ${monitor.product_name}`, message: isNewLow ? `New all-time low: ₹${newPrice}! (Previous low: ₹${allTimeLow})` : `Target price hit: ₹${newPrice} (target: ₹${monitor.target_price})`, is_read: 0, icon: '🔔', priority: 'high' });
  }
  res.json({ new_price: newPrice, previous_price: lastPrice, all_time_low: allTimeLow, is_new_low: isNewLow, is_at_target: isAtTarget, price_change_pct: ((newPrice - lastPrice) / lastPrice * 100).toFixed(2), order_triggered: orderTriggered, order_id: orderId });
});

router.get('/monitor-orders', authMiddleware, (req, res) => {
  const orders = db.findAll('monitor_orders', o => o.user_id === req.userId).sort((a, b) => new Date(b.ordered_at) - new Date(a.ordered_at));
  res.json(orders);
});

router.patch('/monitor-orders/:id/confirm', authMiddleware, (req, res) => {
  db.update('monitor_orders', o => o.id === parseInt(req.params.id) && o.user_id === req.userId, { status: 'confirmed', confirmed_at: new Date().toISOString() });
  const order = db.findOne('monitor_orders', o => o.id === parseInt(req.params.id));
  if (order) db.insert('notifications', { user_id: req.userId, type: 'order_confirmed', title: `✅ Order Confirmed: ${order.product_name}`, message: `You confirmed the order for ${order.quantity}x ${order.product_name} at ₹${order.triggered_price}.`, is_read: 0, icon: '✅', priority: 'medium' });
  res.json({ success: true });
});

router.patch('/monitor-orders/:id/cancel', authMiddleware, (req, res) => {
  db.update('monitor_orders', o => o.id === parseInt(req.params.id) && o.user_id === req.userId, { status: 'cancelled', cancelled_at: new Date().toISOString() });
  res.json({ success: true });
});

// ==================== ACHIEVEMENT CHECKER ====================
function checkAndGrantAchievements(userId) {
  const achievements = getAchievementDefinitions();
  const existing = db.findAll('user_achievements', a => a.user_id === userId);
  const existingIds = new Set(existing.map(a => a.achievement_id));
  const priceCount = db.count('price_entries', pe => pe.user_id === userId);
  const budgetCount = db.count('budgets', b => b.user_id === userId);
  const savingsCount = db.count('savings_goals', g => g.user_id === userId && g.is_active === 1);
  const alertCount = db.count('price_alerts', a => a.user_id === userId);
  const watchlistCount = db.count('watchlist', w => w.user_id === userId);

  const checks = {
    first_price: priceCount >= 1, price_10: priceCount >= 10, price_50: priceCount >= 50,
    price_100: priceCount >= 100, price_500: priceCount >= 500,
    first_budget: budgetCount >= 1, first_savings: savingsCount >= 1,
    first_alert: alertCount >= 1, watchlist_10: watchlistCount >= 10,
    categories_5: new Set(db.findAll('price_entries', pe => pe.user_id === userId).map(pe => {
      const pr = db.findOne('products', p => p.id === pe.product_id);
      return pr?.category_id;
    }).filter(Boolean)).size >= 5
  };

  for (const [id, condition] of Object.entries(checks)) {
    if (condition && !existingIds.has(id)) {
      db.insert('user_achievements', { user_id: userId, achievement_id: id, unlocked_at: new Date().toISOString() });
      const ach = achievements.find(a => a.id === id);
      if (ach) {
        db.insert('notifications', { user_id: userId, type: 'achievement', title: `🏆 Achievement: ${ach.name}`, message: ach.description, is_read: 0, icon: ach.icon, priority: 'medium' });
        const user = db.findOne('users', u => u.id === userId);
        db.update('users', u => u.id === userId, { xp: (user.xp || 0) + ach.xp });
      }
    }
  }
}

module.exports = router;
