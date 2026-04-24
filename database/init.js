const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, 'tracehub.db');
const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    deepseek_api_key TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS contents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT,
    content_type TEXT NOT NULL,
    url TEXT,
    raw_content TEXT,
    extracted_text TEXT,
    summary TEXT,
    tags TEXT,
    file_path TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS rss_feeds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    refresh_interval INTEGER DEFAULT 360,
    last_fetched DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS rss_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    feed_id INTEGER NOT NULL,
    title TEXT,
    link TEXT,
    pub_date DATETIME,
    description TEXT,
    content TEXT,
    is_read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (feed_id) REFERENCES rss_feeds(id)
  );

  CREATE TABLE IF NOT EXISTS rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    condition_type TEXT NOT NULL,
    condition_value TEXT,
    action_type TEXT NOT NULL,
    action_value TEXT,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    session_token TEXT UNIQUE NOT NULL,
    expires_at TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

const ftsTableExists = db.prepare(
  "SELECT name FROM sqlite_master WHERE type='table' AND name='contents_fts'"
).get();

if (!ftsTableExists) {
  db.exec(`
    CREATE VIRTUAL TABLE contents_fts USING fts5(
      title,
      extracted_text,
      summary,
      tags
    );
  `);
}

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_contents_user_id ON contents(user_id);
  CREATE INDEX IF NOT EXISTS idx_contents_content_type ON contents(content_type);
  CREATE INDEX IF NOT EXISTS idx_contents_created_at ON contents(created_at);
  CREATE INDEX IF NOT EXISTS idx_rss_feeds_user_id ON rss_feeds(user_id);
  CREATE INDEX IF NOT EXISTS idx_rss_items_feed_id ON rss_items(feed_id);
  CREATE INDEX IF NOT EXISTS idx_rules_user_id ON rules(user_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(session_token);
`);

console.log('数据库初始化完成');

module.exports = db;
