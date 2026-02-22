const fs = require('fs');
const path = require('path');

class JsonDB {
  constructor(filePath) {
    this.filePath = filePath;
    this.data = {};
    this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this.filePath)) {
        this.data = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      }
    } catch { this.data = {}; }
  }

  _save() {
    fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
  }

  _ensureTable(table) {
    if (!this.data[table]) { this.data[table] = []; this.data[`${table}_seq`] = 0; }
  }

  insert(table, record) {
    this._ensureTable(table);
    this.data[`${table}_seq`]++;
    const id = this.data[`${table}_seq`];
    const entry = { id, ...record, created_at: record.created_at || new Date().toISOString() };
    this.data[table].push(entry);
    this._save();
    return { lastInsertRowid: id, changes: 1 };
  }

  findAll(table, filter = null) {
    this._ensureTable(table);
    if (!filter) return [...this.data[table]];
    return this.data[table].filter(filter);
  }

  findOne(table, filter) {
    this._ensureTable(table);
    return this.data[table].find(filter) || null;
  }

  update(table, filter, updates) {
    this._ensureTable(table);
    let changes = 0;
    this.data[table] = this.data[table].map(row => {
      if (filter(row)) { changes++; return { ...row, ...updates }; }
      return row;
    });
    this._save();
    return { changes };
  }

  delete(table, filter) {
    this._ensureTable(table);
    const before = this.data[table].length;
    this.data[table] = this.data[table].filter(row => !filter(row));
    this._save();
    return { changes: before - this.data[table].length };
  }

  count(table, filter = null) {
    return this.findAll(table, filter).length;
  }

  sum(table, field, filter = null) {
    return this.findAll(table, filter).reduce((s, r) => s + (r[field] || 0), 0);
  }

  avg(table, field, filter = null) {
    const items = this.findAll(table, filter);
    if (items.length === 0) return 0;
    return items.reduce((s, r) => s + (r[field] || 0), 0) / items.length;
  }
}

module.exports = JsonDB;
