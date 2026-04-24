const db = require('../database/db');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

class User {
  static create(username, password) {
    const hashedPassword = bcrypt.hashSync(password, 10);
    
    const existingUser = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existingUser) {
      throw new Error('用户名已存在');
    }
    
    const result = db.prepare(`
      INSERT INTO users (username, password) VALUES (?, ?)
    `).run(username, hashedPassword);
    
    return this.findById(result.lastInsertRowid);
  }

  static findById(id) {
    return db.prepare('SELECT id, username, deepseek_api_key, created_at FROM users WHERE id = ?').get(id);
  }

  static findByUsername(username) {
    return db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  }

  static validatePassword(user, password) {
    return bcrypt.compareSync(password, user.password);
  }

  static updateApiKey(userId, apiKey) {
    db.prepare('UPDATE users SET deepseek_api_key = ? WHERE id = ?').run(apiKey, userId);
    return this.findById(userId);
  }

  static createSession(userId) {
    const sessionToken = uuidv4();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    
    db.prepare(`
      INSERT INTO sessions (user_id, session_token, expires_at)
      VALUES (?, ?, ?)
    `).run(userId, sessionToken, expiresAt.toISOString());
    
    return { sessionToken, expiresAt };
  }

  static validateSession(sessionToken) {
    const session = db.prepare(`
      SELECT s.*, u.id as user_id, u.username, u.deepseek_api_key
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.session_token = ? AND s.expires_at > datetime('now')
    `).get(sessionToken);
    
    return session;
  }

  static deleteSession(sessionToken) {
    db.prepare('DELETE FROM sessions WHERE session_token = ?').run(sessionToken);
  }

  static deleteExpiredSessions() {
    db.prepare('DELETE FROM sessions WHERE expires_at < datetime("now")').run();
  }
}

module.exports = User;
