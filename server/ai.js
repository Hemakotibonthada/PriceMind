const OpenAI = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || 'demo' });

// ==================== PRICE ANALYSIS ====================
async function analyzePriceFairness(productName, price, allPrices, category) {
  try {
    const prompt = `Analyze this price for fairness and give recommendations:
Product: ${productName}
Category: ${category || 'General'}
Price: $${price}
Other reported prices: ${allPrices.length > 0 ? allPrices.map(p => '$' + p.toFixed(2)).join(', ') : 'No data yet'}

Respond with JSON only:
{
  "rating": "cheap|fair|average|expensive|overpriced",
  "score": <1-100 deal score>,
  "percentile": <price percentile>,
  "suggestion": "<buying advice>",
  "predicted_trend": "rising|falling|stable",
  "best_time_to_buy": "<timing advice>",
  "savings_tip": "<how to save on this>",
  "alternative_suggestion": "<cheaper alternative>",
  "seasonal_note": "<any seasonal pricing patterns>"
}`;
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      max_tokens: 400, temperature: 0.3
    });
    return JSON.parse(response.choices[0].message.content);
  } catch {
    return fallbackPriceAnalysis(price, allPrices);
  }
}

function fallbackPriceAnalysis(price, allPrices) {
  if (allPrices.length === 0) {
    return { rating: 'fair', score: 50, percentile: 50, suggestion: 'First price entry — no comparison data yet.', predicted_trend: 'stable', best_time_to_buy: 'Monitor prices over time for better insights.', savings_tip: 'Compare with other stores before buying.', alternative_suggestion: 'Check generic/store brands for savings.', seasonal_note: 'Watch for seasonal sales and promotions.' };
  }
  const avg = allPrices.reduce((s, p) => s + p, 0) / allPrices.length;
  const sorted = [...allPrices].sort((a, b) => a - b);
  const percentile = Math.round(sorted.filter(p => p <= price).length / sorted.length * 100);
  const diff = ((price - avg) / avg) * 100;
  let rating, score;
  if (diff < -20) { rating = 'cheap'; score = 95; }
  else if (diff < -5) { rating = 'fair'; score = 78; }
  else if (diff < 10) { rating = 'average'; score = 55; }
  else if (diff < 30) { rating = 'expensive'; score = 30; }
  else { rating = 'overpriced'; score = 12; }
  const recent = allPrices.slice(-5);
  const trend = recent.length >= 2 ? (recent[recent.length - 1] > recent[0] ? 'rising' : recent[recent.length - 1] < recent[0] ? 'falling' : 'stable') : 'stable';
  return { rating, score, percentile, suggestion: score >= 70 ? 'Great deal! Consider buying now.' : score >= 40 ? 'Price is around average for this product.' : 'Price is above average. Consider waiting for a sale.', predicted_trend: trend, best_time_to_buy: trend === 'falling' ? 'Prices are dropping — wait a bit longer.' : trend === 'rising' ? 'Buy soon — prices are trending up.' : 'Stable pricing — buy when convenient.', savings_tip: 'Compare prices across at least 3 stores.', alternative_suggestion: 'Look for store-brand alternatives.', seasonal_note: 'Prices may vary by season.' };
}

// ==================== SERVICE QUOTE ANALYSIS ====================
async function analyzeServiceQuote(serviceType, description, quotedPrice, city, country) {
  try {
    const prompt = `Analyze this service quote for fairness:
Service: ${serviceType}, Description: ${description}
Quoted Price: $${quotedPrice}, Location: ${city}, ${country}
Respond with JSON only:
{
  "fairness_score": <1-100>,
  "rating": "great_deal|fair|slightly_high|overpriced|suspicious",
  "typical_range": {"low": <number>, "high": <number>},
  "analysis": "<2-3 sentence analysis>",
  "negotiation_tip": "<negotiation advice>",
  "red_flags": ["<any red flags>"],
  "questions_to_ask": ["<questions for the provider>"],
  "diy_alternative": "<can this be DIY?>"
}`;
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' }, max_tokens: 500, temperature: 0.3
    });
    return JSON.parse(response.choices[0].message.content);
  } catch {
    return { fairness_score: 50, rating: 'fair', typical_range: { low: quotedPrice * 0.7, high: quotedPrice * 1.3 }, analysis: 'AI service unavailable. Based on estimates, this quote appears reasonable.', negotiation_tip: 'Always get 2-3 quotes for comparison.', red_flags: [], questions_to_ask: ['What is included in this price?', 'Are there any potential additional charges?'], diy_alternative: 'Research online tutorials for simpler tasks.' };
  }
}

// ==================== PRODUCT CATEGORIZATION ====================
async function categorizeProduct(productName) {
  try {
    const prompt = `Categorize this product: "${productName}"
Categories: Groceries, Electronics, Clothing, Home & Garden, Health & Beauty, Automotive, Services, Food & Dining, Utilities, Entertainment, Travel, Education, Fuel & Energy, Insurance, Subscriptions
Respond JSON: {"category": "<category>", "subcategory": "<subcategory>"}`;
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' }, max_tokens: 100, temperature: 0
    });
    return JSON.parse(response.choices[0].message.content);
  } catch {
    const lower = productName.toLowerCase();
    if (/milk|bread|egg|fruit|vegeta|meat|chicken|rice|pasta|cereal|cheese|butter|yogurt|juice|water|soda|coffee|tea/i.test(lower)) return { category: 'Groceries', subcategory: 'Food' };
    if (/phone|laptop|tablet|computer|tv|camera|headphone|speaker|charger|cable|mouse|keyboard/i.test(lower)) return { category: 'Electronics', subcategory: 'Devices' };
    if (/shirt|pant|dress|shoe|jacket|coat|sock|hat|jean|sweater/i.test(lower)) return { category: 'Clothing', subcategory: 'Apparel' };
    if (/gas|petrol|diesel|fuel|electric/i.test(lower)) return { category: 'Fuel & Energy', subcategory: 'Fuel' };
    if (/medicine|vitamin|supplement|bandage|soap|shampoo/i.test(lower)) return { category: 'Health & Beauty', subcategory: 'Health' };
    return { category: 'Groceries', subcategory: 'General' };
  }
}

// ==================== SPENDING INSIGHTS ====================
async function generateSpendingInsights(spendingData, budgetData) {
  try {
    const prompt = `Analyze this spending data and provide insights:
Spending: ${JSON.stringify(spendingData)}
${budgetData ? 'Budgets: ' + JSON.stringify(budgetData) : ''}
Respond JSON:
{
  "summary": "<spending summary>",
  "top_category": "<highest spend>",
  "savings_opportunities": ["<tip1>", "<tip2>", "<tip3>"],
  "predicted_monthly_spend": <number>,
  "inflation_impact": "<inflation analysis>",
  "budget_grade": "A|B|C|D|F",
  "spending_personality": "<type of spender>",
  "weekly_breakdown": "<weekly spending pattern>",
  "danger_zones": ["<overspending areas>"],
  "achievements": ["<positive behaviors>"]
}`;
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' }, max_tokens: 500, temperature: 0.4
    });
    return JSON.parse(response.choices[0].message.content);
  } catch {
    const total = spendingData.reduce((s, c) => s + (c.total || 0), 0);
    return { summary: `You spent $${total.toFixed(2)} across ${spendingData.length} categories.`, top_category: spendingData[0]?.category || 'Unknown', savings_opportunities: ['Compare prices before buying', 'Set price alerts for frequent purchases', 'Buy in bulk for staples'], predicted_monthly_spend: total, inflation_impact: 'Monitor prices over time to track inflation impact.', budget_grade: total < 1000 ? 'A' : total < 2000 ? 'B' : total < 3000 ? 'C' : 'D', spending_personality: 'Mindful Spender', weekly_breakdown: 'Track weekly to see patterns.', danger_zones: [], achievements: ['You\'re tracking spending — that\'s step one!'] };
  }
}

// ==================== PRICE PREDICTION ====================
async function predictPrice(productName, priceHistory, category) {
  try {
    const prompt = `Predict the price trend for this product:
Product: ${productName}, Category: ${category}
Price history: ${priceHistory.map(p => `$${p.price} on ${p.date}`).join(', ')}
Respond JSON:
{
  "predicted_direction": "up|down|stable",
  "confidence": <0-100>,
  "predicted_price_30d": <number>,
  "reasoning": "<brief explanation>",
  "best_buy_window": "<when to buy>"
}`;
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' }, max_tokens: 300, temperature: 0.3
    });
    return JSON.parse(response.choices[0].message.content);
  } catch {
    const prices = priceHistory.map(p => p.price);
    const avg = prices.length > 0 ? prices.reduce((s, p) => s + p, 0) / prices.length : 0;
    const trend = prices.length >= 2 ? (prices[prices.length - 1] > prices[0] ? 'up' : prices[prices.length - 1] < prices[0] ? 'down' : 'stable') : 'stable';
    return { predicted_direction: trend, confidence: 40, predicted_price_30d: avg, reasoning: 'Based on recent price history.', best_buy_window: 'Monitor for sales.' };
  }
}

// ==================== SMART BUDGET ====================
async function generateSmartBudget(spendingHistory, income) {
  try {
    const prompt = `Create a smart budget based on spending:
History: ${JSON.stringify(spendingHistory)}
Monthly income: $${income || 'Unknown'}
Respond JSON:
{
  "suggested_budgets": [{"category": "<cat>", "amount": <number>, "reasoning": "<why>"}],
  "savings_target": <number>,
  "tips": ["<tip1>", "<tip2>"]
}`;
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' }, max_tokens: 400, temperature: 0.4
    });
    return JSON.parse(response.choices[0].message.content);
  } catch {
    const cats = ['Groceries', 'Transport', 'Dining', 'Utilities', 'Entertainment', 'Health', 'Shopping'];
    return { suggested_budgets: cats.map(c => ({ category: c, amount: 200, reasoning: 'Default suggestion' })), savings_target: 500, tips: ['Track every expense', 'Automate savings'] };
  }
}

module.exports = { analyzePriceFairness, analyzeServiceQuote, categorizeProduct, generateSpendingInsights, predictPrice, generateSmartBudget };
