const OpenAI = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || 'demo' });

// ==================== PRICE ANALYSIS ====================
async function analyzePriceFairness(productName, price, allPrices, category) {
  try {
    const prompt = `Analyze this price for fairness:\nProduct: ${productName}\nCategory: ${category || 'General'}\nPrice: $${price}\nOther prices: ${allPrices.length > 0 ? allPrices.map(p => '$' + p.toFixed(2)).join(', ') : 'No data yet'}\nRespond JSON only:\n{"rating":"cheap|fair|average|expensive|overpriced","score":<1-100>,"percentile":<0-100>,"suggestion":"<advice>","predicted_trend":"rising|falling|stable","best_time_to_buy":"<timing>","savings_tip":"<tip>","alternative_suggestion":"<alt>","seasonal_note":"<note>","quality_note":"<quality>","bulk_tip":"<bulk>","store_tip":"<store>"}`;
    const r = await openai.chat.completions.create({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }], response_format: { type: 'json_object' }, max_tokens: 500, temperature: 0.3 });
    return JSON.parse(r.choices[0].message.content);
  } catch { return fallbackPriceAnalysis(price, allPrices); }
}

function fallbackPriceAnalysis(price, allPrices) {
  if (allPrices.length === 0) return { rating: 'fair', score: 50, percentile: 50, suggestion: 'First price entry — no comparison data yet.', predicted_trend: 'stable', best_time_to_buy: 'Monitor prices over time.', savings_tip: 'Compare with other stores.', alternative_suggestion: 'Check generic/store brands.', seasonal_note: 'Watch for seasonal sales.', quality_note: 'Consider quality-to-price ratio.', bulk_tip: 'Check if bulk buying saves money.', store_tip: 'Compare across 3+ stores.' };
  const avg = allPrices.reduce((s, p) => s + p, 0) / allPrices.length;
  const sorted = [...allPrices].sort((a, b) => a - b);
  const percentile = Math.round(sorted.filter(p => p <= price).length / sorted.length * 100);
  const diff = ((price - avg) / avg) * 100;
  let rating, score;
  if (diff < -20) { rating = 'cheap'; score = 95; } else if (diff < -5) { rating = 'fair'; score = 78; } else if (diff < 10) { rating = 'average'; score = 55; } else if (diff < 30) { rating = 'expensive'; score = 30; } else { rating = 'overpriced'; score = 12; }
  const recent = allPrices.slice(-5);
  const trend = recent.length >= 2 ? (recent[recent.length - 1] > recent[0] ? 'rising' : recent[recent.length - 1] < recent[0] ? 'falling' : 'stable') : 'stable';
  return { rating, score, percentile, suggestion: score >= 70 ? 'Great deal!' : score >= 40 ? 'Average price.' : 'Above average. Wait for sale.', predicted_trend: trend, best_time_to_buy: trend === 'falling' ? 'Prices dropping — wait.' : trend === 'rising' ? 'Buy soon.' : 'Buy when convenient.', savings_tip: 'Compare at 3+ stores.', alternative_suggestion: 'Try store brands.', seasonal_note: 'Prices vary by season.', quality_note: score >= 60 ? 'Good value.' : 'Consider if quality justifies price.', bulk_tip: 'Bulk may save 10-20%.', store_tip: 'Check discount retailers.' };
}

// ==================== SERVICE QUOTE ANALYSIS ====================
async function analyzeServiceQuote(serviceType, description, quotedPrice, city, country) {
  try {
    const prompt = `Analyze service quote:\nService: ${serviceType}, Desc: ${description}\nPrice: $${quotedPrice}, Location: ${city}, ${country}\nJSON: {"fairness_score":<1-100>,"rating":"great_deal|fair|slightly_high|overpriced|suspicious","typical_range":{"low":<n>,"high":<n>},"analysis":"<text>","negotiation_tip":"<tip>","red_flags":["<flag>"],"questions_to_ask":["<q>"],"diy_alternative":"<diy>","warranty_tip":"<tip>","timing_tip":"<tip>"}`;
    const r = await openai.chat.completions.create({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }], response_format: { type: 'json_object' }, max_tokens: 500, temperature: 0.3 });
    return JSON.parse(r.choices[0].message.content);
  } catch { return { fairness_score: 50, rating: 'fair', typical_range: { low: quotedPrice * 0.7, high: quotedPrice * 1.3 }, analysis: 'Quote appears reasonable.', negotiation_tip: 'Get 2-3 quotes.', red_flags: [], questions_to_ask: ['What is included?', 'Additional charges?'], diy_alternative: 'Research tutorials.', warranty_tip: 'Ask about warranty.', timing_tip: 'Off-season may be cheaper.' }; }
}

// ==================== PRODUCT CATEGORIZATION ====================
async function categorizeProduct(productName) {
  try {
    const prompt = `Categorize: "${productName}"\nCategories: Groceries, Electronics, Clothing, Home & Garden, Health & Beauty, Automotive, Services, Food & Dining, Utilities, Entertainment, Travel, Education, Fuel & Energy, Insurance, Subscriptions\nJSON: {"category":"<cat>","subcategory":"<sub>","tags":["<t1>","<t2>"]}`;
    const r = await openai.chat.completions.create({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }], response_format: { type: 'json_object' }, max_tokens: 150, temperature: 0 });
    return JSON.parse(r.choices[0].message.content);
  } catch {
    const l = productName.toLowerCase();
    if (/milk|bread|egg|fruit|vegeta|meat|chicken|rice|pasta|cereal|cheese|butter|yogurt|juice|water|soda|coffee|tea|flour|sugar|salt|oil/i.test(l)) return { category: 'Groceries', subcategory: 'Food', tags: ['essential'] };
    if (/phone|laptop|tablet|computer|tv|camera|headphone|speaker|charger|cable|mouse|keyboard|monitor/i.test(l)) return { category: 'Electronics', subcategory: 'Devices', tags: ['tech'] };
    if (/shirt|pant|dress|shoe|jacket|coat|sock|hat|jean|sweater/i.test(l)) return { category: 'Clothing', subcategory: 'Apparel', tags: ['fashion'] };
    if (/gas|petrol|diesel|fuel/i.test(l)) return { category: 'Fuel & Energy', subcategory: 'Fuel', tags: ['energy'] };
    if (/medicine|vitamin|soap|shampoo|toothpaste/i.test(l)) return { category: 'Health & Beauty', subcategory: 'Health', tags: ['wellness'] };
    return { category: 'Groceries', subcategory: 'General', tags: ['general'] };
  }
}

// ==================== SPENDING INSIGHTS ====================
async function generateSpendingInsights(spendingData, budgetData) {
  try {
    const prompt = `Analyze spending:\n${JSON.stringify(spendingData)}\n${budgetData ? 'Budgets: ' + JSON.stringify(budgetData) : ''}\nJSON: {"summary":"<text>","top_category":"<cat>","savings_opportunities":["<t1>","<t2>","<t3>"],"predicted_monthly_spend":<n>,"inflation_impact":"<text>","budget_grade":"A|B|C|D|F","spending_personality":"<type>","weekly_breakdown":"<text>","danger_zones":["<area>"],"achievements":["<ach>"],"financial_health_score":<1-100>,"money_saving_challenge":"<challenge>","smart_tip":"<tip>"}`;
    const r = await openai.chat.completions.create({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }], response_format: { type: 'json_object' }, max_tokens: 600, temperature: 0.4 });
    return JSON.parse(r.choices[0].message.content);
  } catch {
    const total = spendingData.reduce((s, c) => s + (c.total || 0), 0);
    return { summary: `$${total.toFixed(2)} across ${spendingData.length} categories.`, top_category: spendingData[0]?.category || 'Unknown', savings_opportunities: ['Compare prices', 'Set alerts', 'Buy in bulk'], predicted_monthly_spend: total, inflation_impact: 'Monitor prices for inflation.', budget_grade: total < 1000 ? 'A' : total < 2000 ? 'B' : 'C', spending_personality: 'Mindful Spender', weekly_breakdown: 'Track weekly.', danger_zones: [], achievements: ['Tracking spending!'], financial_health_score: 65, money_saving_challenge: 'Try a no-spend day!', smart_tip: 'Automate savings.' };
  }
}

// ==================== PRICE PREDICTION ====================
async function predictPrice(productName, priceHistory, category) {
  try {
    const prompt = `Predict price trend:\nProduct: ${productName}, Category: ${category}\nHistory: ${priceHistory.map(p => `$${p.price} on ${p.date}`).join(', ')}\nJSON: {"predicted_direction":"up|down|stable","confidence":<0-100>,"predicted_price_30d":<n>,"predicted_price_90d":<n>,"reasoning":"<text>","best_buy_window":"<when>","volatility":"low|medium|high"}`;
    const r = await openai.chat.completions.create({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }], response_format: { type: 'json_object' }, max_tokens: 300, temperature: 0.3 });
    return JSON.parse(r.choices[0].message.content);
  } catch {
    const prices = priceHistory.map(p => p.price);
    const avg = prices.length > 0 ? prices.reduce((s, p) => s + p, 0) / prices.length : 0;
    const trend = prices.length >= 2 ? (prices[prices.length - 1] > prices[0] ? 'up' : prices[prices.length - 1] < prices[0] ? 'down' : 'stable') : 'stable';
    return { predicted_direction: trend, confidence: 40, predicted_price_30d: avg, predicted_price_90d: avg * (trend === 'up' ? 1.05 : trend === 'down' ? 0.95 : 1), reasoning: 'Based on history.', best_buy_window: 'Monitor for sales.', volatility: 'medium' };
  }
}

// ==================== SMART BUDGET ====================
async function generateSmartBudget(spendingHistory, income) {
  try {
    const prompt = `Create budget:\nHistory: ${JSON.stringify(spendingHistory)}\nIncome: $${income || 'Unknown'}\nJSON: {"suggested_budgets":[{"category":"<cat>","amount":<n>,"reasoning":"<why>"}],"savings_target":<n>,"tips":["<t1>","<t2>"],"financial_strategy":"<text>","emergency_fund_target":<n>}`;
    const r = await openai.chat.completions.create({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }], response_format: { type: 'json_object' }, max_tokens: 500, temperature: 0.4 });
    return JSON.parse(r.choices[0].message.content);
  } catch {
    return { suggested_budgets: ['Groceries','Transport','Dining','Utilities','Entertainment','Health','Shopping'].map(c => ({ category: c, amount: 200, reasoning: 'Default' })), savings_target: 500, tips: ['Track expenses', 'Automate savings'], financial_strategy: 'Build emergency fund first.', emergency_fund_target: 3000 };
  }
}

// ==================== FINANCIAL HEALTH ====================
async function calculateFinancialHealth(userData) {
  try {
    const prompt = `Financial health score:\n${JSON.stringify(userData)}\nJSON: {"overall_score":<0-100>,"components":{"spending_control":<0-100>,"savings_rate":<0-100>,"budget_adherence":<0-100>,"price_awareness":<0-100>},"strengths":["<s>"],"improvements":["<i>"],"next_milestone":"<text>","plan":"<30-day plan>"}`;
    const r = await openai.chat.completions.create({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }], response_format: { type: 'json_object' }, max_tokens: 500, temperature: 0.3 });
    return JSON.parse(r.choices[0].message.content);
  } catch {
    return { overall_score: 65, components: { spending_control: 60, savings_rate: 50, budget_adherence: 70, price_awareness: 75 }, strengths: ['Price tracking', 'Budget awareness'], improvements: ['Increase savings', 'Reduce impulse buys'], next_milestone: '3-month emergency fund', plan: 'Track, cut subscriptions, auto-save, review.' };
  }
}

// ==================== RECEIPT ANALYSIS ====================
async function analyzeReceipt(receiptText) {
  try {
    const prompt = `Parse receipt:\n${receiptText}\nJSON: {"store_name":"<store>","date":"<date>","items":[{"name":"<item>","price":<n>,"quantity":<n>,"category":"<cat>"}],"subtotal":<n>,"tax":<n>,"total":<n>,"savings_found":<n>}`;
    const r = await openai.chat.completions.create({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }], response_format: { type: 'json_object' }, max_tokens: 600, temperature: 0.2 });
    return JSON.parse(r.choices[0].message.content);
  } catch { return { store_name: 'Unknown', date: new Date().toISOString().split('T')[0], items: [], subtotal: 0, tax: 0, total: 0, savings_found: 0 }; }
}

// ==================== DAILY TIP ====================
function getDailyTip() {
  const tips = [
    { icon: '💡', tip: 'Compare prices at 3+ stores before big purchases.', category: 'Shopping' },
    { icon: '🏷️', tip: 'Check cashback offers before every purchase.', category: 'Savings' },
    { icon: '📊', tip: 'Review subscriptions monthly.', category: 'Budgeting' },
    { icon: '🛒', tip: 'Shop with a list to avoid impulse buys.', category: 'Shopping' },
    { icon: '💰', tip: 'Automate savings on payday.', category: 'Savings' },
    { icon: '🍳', tip: 'Cooking at home saves 60% vs eating out.', category: 'Food' },
    { icon: '⚡', tip: 'Unplug devices to save on electricity.', category: 'Utilities' },
    { icon: '📦', tip: 'Buy generic brands — 20-40% cheaper.', category: 'Shopping' },
    { icon: '💳', tip: 'Pay credit cards in full monthly.', category: 'Credit' },
    { icon: '📅', tip: 'Plan meals weekly to reduce food waste.', category: 'Food' },
    { icon: '🔔', tip: 'Set price alerts for regular items.', category: 'Shopping' },
    { icon: '🏦', tip: 'Keep 3-6 months in emergency fund.', category: 'Savings' },
    { icon: '📈', tip: 'Start investing early.', category: 'Investing' },
    { icon: '🤝', tip: 'Negotiate bills annually.', category: 'Bills' },
    { icon: '☕', tip: 'Home coffee saves $1,000+/year.', category: 'Food' },
    { icon: '📚', tip: 'Use the library for free content.', category: 'Entertainment' },
    { icon: '🌍', tip: 'Travel off-peak for 30-50% savings.', category: 'Travel' },
    { icon: '💊', tip: 'Generic meds are 80-85% cheaper.', category: 'Health' },
    { icon: '📲', tip: 'Review your phone plan for savings.', category: 'Bills' },
    { icon: '🧊', tip: 'Freeze leftovers instead of wasting.', category: 'Food' },
    { icon: '💡', tip: 'LED bulbs use 75% less energy.', category: 'Utilities' },
    { icon: '🎯', tip: 'Specific goals are 42% more achievable.', category: 'Goals' },
    { icon: '🌱', tip: 'Grow herbs at home to save money.', category: 'Food' },
    { icon: '🔧', tip: 'Learn basic repairs from YouTube.', category: 'Home' },
    { icon: '🎁', tip: 'Give experiences instead of things.', category: 'Gifts' },
    { icon: '🏋️', tip: 'Outdoor exercise vs gym saves $500+/yr.', category: 'Health' },
    { icon: '🚗', tip: 'Regular maintenance prevents costly repairs.', category: 'Auto' },
    { icon: '🏠', tip: 'Refinancing could save thousands yearly.', category: 'Housing' },
    { icon: '📱', tip: 'Use price tracking apps consistently.', category: 'Shopping' },
    { icon: '🎓', tip: 'Financial literacy pays lifelong dividends.', category: 'Education' }
  ];
  const day = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
  return tips[day % tips.length];
}

// ==================== CHALLENGES ====================
function generateChallenge(type) {
  const ch = {
    daily: [
      { name: 'No-Spend Day', description: 'Zero spending today!', xp: 50, icon: '🚫' },
      { name: 'Track Every Penny', description: 'Log every expense.', xp: 30, icon: '📝' },
      { name: 'Pack Lunch', description: 'Bring lunch from home.', xp: 25, icon: '🥪' },
      { name: 'Walk Instead', description: 'Walk instead of driving.', xp: 20, icon: '🚶' },
      { name: 'Compare 3 Prices', description: 'Compare at 3 stores.', xp: 35, icon: '🔍' },
      { name: 'Drink Water Only', description: 'No paid beverages.', xp: 15, icon: '💧' },
      { name: 'Use a Coupon', description: 'Apply at least one coupon.', xp: 20, icon: '🎫' }
    ],
    weekly: [
      { name: 'Meal Prep Master', description: 'Prep all weekday meals.', xp: 150, icon: '🍱' },
      { name: 'Cash Only Week', description: 'Use only cash.', xp: 200, icon: '💵' },
      { name: 'Subscription Audit', description: 'Cancel unused subs.', xp: 100, icon: '📋' },
      { name: 'Price Tracker', description: 'Add 10 prices.', xp: 120, icon: '📊' },
      { name: 'Budget Builder', description: 'Set all budgets.', xp: 100, icon: '🎯' }
    ],
    monthly: [
      { name: 'Save $100 Extra', description: 'Extra $100 saved.', xp: 500, icon: '🏦' },
      { name: 'No Dining Out', description: 'Cook all meals.', xp: 600, icon: '🏠' },
      { name: 'Financial Check-Up', description: 'Review everything.', xp: 300, icon: '🩺' },
      { name: 'Community Champ', description: 'Add 50 prices.', xp: 400, icon: '🏆' },
      { name: 'Negotiate Bills', description: 'Negotiate 3+ bills.', xp: 350, icon: '🤝' }
    ]
  };
  const list = ch[type] || ch.daily;
  return list[Math.floor(Math.random() * list.length)];
}

// ==================== ACHIEVEMENTS ====================
function getAchievementDefinitions() {
  return [
    { id: 'first_price', name: 'First Steps', description: 'Add first price', icon: '🎯', xp: 50 },
    { id: 'price_10', name: 'Price Hunter', description: 'Add 10 prices', icon: '🔍', xp: 100 },
    { id: 'price_50', name: 'Data Collector', description: 'Add 50 prices', icon: '📊', xp: 250 },
    { id: 'price_100', name: 'Centurion', description: 'Add 100 prices', icon: '💯', xp: 500 },
    { id: 'price_500', name: 'Price Master', description: 'Add 500 prices', icon: '👑', xp: 1000 },
    { id: 'first_budget', name: 'Budget Starter', description: 'First budget', icon: '📋', xp: 50 },
    { id: 'first_savings', name: 'Saver Begins', description: 'First savings goal', icon: '🏦', xp: 50 },
    { id: 'first_alert', name: 'Alert Set', description: 'First price alert', icon: '🔔', xp: 30 },
    { id: 'deal_finder', name: 'Deal Finder', description: 'Find 80+ deal', icon: '🏷️', xp: 100 },
    { id: 'streak_7', name: 'Week Warrior', description: '7-day streak', icon: '🔥', xp: 200 },
    { id: 'streak_30', name: 'Monthly Maven', description: '30-day streak', icon: '⚡', xp: 500 },
    { id: 'categories_5', name: 'Diversified', description: '5 categories', icon: '🌈', xp: 150 },
    { id: 'watchlist_10', name: 'Watchful Eye', description: 'Watch 10 items', icon: '👁️', xp: 100 },
    { id: 'spending_30', name: 'Expense Tracker', description: '30 days tracked', icon: '📈', xp: 300 },
    { id: 'helper', name: 'Community Helper', description: 'Verify 10 prices', icon: '🤝', xp: 200 },
    { id: 'goal_done', name: 'Goal Achieved!', description: 'Complete savings goal', icon: '🎉', xp: 500 },
    { id: 'budget_ok', name: 'Budget Master', description: 'Under budget 1 month', icon: '🎯', xp: 400 },
    { id: 'night_owl', name: 'Night Owl', description: 'Price after midnight', icon: '🦉', xp: 50 },
    { id: 'early_bird', name: 'Early Bird', description: 'Price before 7 AM', icon: '🐦', xp: 50 },
    { id: 'global', name: 'Global Shopper', description: '3+ countries', icon: '🌍', xp: 300 }
  ];
}

// ==================== FINANCIAL QUIZ ====================
function generateFinancialQuiz() {
  const questions = [
    { q: 'What is the 50/30/20 rule?', options: ['Saving/Investing/Spending', 'Needs/Wants/Savings', 'Food/Housing/Entertainment', 'Income/Tax/Savings'], correct: 1, explanation: '50% needs, 30% wants, 20% savings.' },
    { q: 'What is compound interest?', options: ['Interest on principal only', 'Interest on interest + principal', 'Fixed rate', 'Variable rate'], correct: 1, explanation: 'Interest on both principal and accumulated interest.' },
    { q: 'What is an emergency fund?', options: ['Investment account', '3-6 months expenses', 'Credit limit', 'Insurance'], correct: 1, explanation: '3-6 months of essential expenses saved.' },
    { q: 'What is inflation?', options: ['Money growth', 'Price decrease', 'General price increase', 'Interest rate'], correct: 2, explanation: 'General increase in prices over time.' },
    { q: 'Best debt payoff method?', options: ['Minimum on all', 'Highest interest first', 'Ignore them', 'Equal payments'], correct: 1, explanation: 'Avalanche method saves the most.' },
    { q: 'What is dollar cost averaging?', options: ['Buying lowest price', 'Fixed investing regularly', 'Saving dollars only', 'Converting currencies'], correct: 1, explanation: 'Fixed amount at regular intervals.' },
    { q: 'Ideal savings percentage?', options: ['5%', '10%', '20% or more', '50%'], correct: 2, explanation: 'Experts recommend at least 20%.' },
    { q: 'What is net worth?', options: ['Total income', 'Assets minus liabilities', 'Bank balance', 'Total savings'], correct: 1, explanation: 'Assets - Liabilities = Net Worth.' },
    { q: 'What is diversification?', options: ['One investment', 'Spreading investments', 'High-risk strategy', 'Saving in banks'], correct: 1, explanation: 'Spreading risk across investments.' },
    { q: 'What is a budget?', options: ['Spending limit', 'Income tracker', 'Plan for income & expenses', 'Savings account'], correct: 2, explanation: 'Planned allocation of income.' }
  ];
  return questions.sort(() => Math.random() - 0.5).slice(0, 5);
}

module.exports = {
  analyzePriceFairness, analyzeServiceQuote, categorizeProduct,
  generateSpendingInsights, predictPrice, generateSmartBudget,
  calculateFinancialHealth, analyzeReceipt,
  getDailyTip, generateChallenge, getAchievementDefinitions, generateFinancialQuiz
};
