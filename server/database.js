const JsonDB = require('../shared/jsondb');
const path = require('path');

const db = new JsonDB(path.join(__dirname, '..', 'data', 'pricemind-data.json'));

// Seed categories if empty
if (db.count('categories') === 0) {
  const cats = [
    ['Groceries', '🛒'], ['Electronics', '📱'], ['Clothing', '👕'],
    ['Home & Garden', '🏠'], ['Health & Beauty', '💊'], ['Automotive', '🚗'],
    ['Services', '🔧'], ['Food & Dining', '🍕'], ['Utilities', '💡'],
    ['Entertainment', '🎬'], ['Travel', '✈️'], ['Education', '📚'],
    ['Fuel & Energy', '⛽'], ['Insurance', '🛡️'], ['Subscriptions', '📋']
  ];
  for (const [name, icon] of cats) {
    db.insert('categories', { name, icon });
  }
}

module.exports = db;
