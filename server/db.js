const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'chocoluxe.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function run(sql, params = []) {
  const stmt = db.prepare(sql);
  const result = stmt.run(params);
  return { lastID: result.lastInsertRowid, changes: result.changes };
}

function get(sql, params = []) {
  const stmt = db.prepare(sql);
  return stmt.get(params);
}

function all(sql, params = []) {
  const stmt = db.prepare(sql);
  return stmt.all(params);
}

function transaction(fn) {
  const tx = db.transaction(fn);
  return tx();
}

module.exports = {
  db,
  run,
  get,
  all,
  transaction
};