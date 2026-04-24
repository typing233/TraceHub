const db = require('../database/db');

class RSSFeed {
  static create(userId, name, url) {
    const existing = db.prepare('SELECT id FROM rss_feeds WHERE user_id = ? AND url = ?').get(userId, url);
    if (existing) {
      throw new Error('该 RSS 源已存在');
    }
    
    const result = db.prepare(`
      INSERT INTO rss_feeds (user_id, name, url)
      VALUES (?, ?, ?)
    `).run(userId, name, url);
    
    return this.findById(userId, result.lastInsertRowid);
  }

  static findById(userId, id) {
    return db.prepare('SELECT * FROM rss_feeds WHERE id = ? AND user_id = ?').get(id, userId);
  }

  static findAllByUserId(userId) {
    return db.prepare('SELECT * FROM rss_feeds WHERE user_id = ? ORDER BY created_at DESC').all(userId);
  }

  static update(userId, id, data) {
    const fields = [];
    const values = [];
    
    if (data.name !== undefined) {
      fields.push('name = ?');
      values.push(data.name);
    }
    if (data.url !== undefined) {
      fields.push('url = ?');
      values.push(data.url);
    }
    if (data.last_fetched !== undefined) {
      fields.push('last_fetched = ?');
      values.push(data.last_fetched);
    }
    
    if (fields.length === 0) {
      return this.findById(userId, id);
    }
    
    values.push(id, userId);
    
    db.prepare(`
      UPDATE rss_feeds SET ${fields.join(', ')} WHERE id = ? AND user_id = ?
    `).run(...values);
    
    return this.findById(userId, id);
  }

  static delete(userId, id) {
    db.prepare('DELETE FROM rss_items WHERE feed_id = ?').run(id);
    const result = db.prepare('DELETE FROM rss_feeds WHERE id = ? AND user_id = ?').run(id, userId);
    return result.changes > 0;
  }

  static getAllFeeds() {
    return db.prepare('SELECT * FROM rss_feeds').all();
  }
}

class RSSItem {
  static create(feedId, data) {
    const existing = db.prepare('SELECT id FROM rss_items WHERE feed_id = ? AND link = ?').get(feedId, data.link);
    if (existing) {
      return null;
    }
    
    const result = db.prepare(`
      INSERT INTO rss_items (feed_id, title, link, pub_date, description, content)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(feedId, data.title, data.link, data.pubDate, data.description, data.content);
    
    return this.findById(result.lastInsertRowid);
  }

  static findById(id) {
    return db.prepare('SELECT * FROM rss_items WHERE id = ?').get(id);
  }

  static findByFeedId(feedId, options = {}) {
    const { limit = 50, offset = 0, unreadOnly = false } = options;
    
    let query = 'SELECT * FROM rss_items WHERE feed_id = ?';
    const params = [feedId];
    
    if (unreadOnly) {
      query += ' AND is_read = 0';
    }
    
    query += ' ORDER BY pub_date DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    
    return db.prepare(query).all(...params);
  }

  static markAsRead(id) {
    db.prepare('UPDATE rss_items SET is_read = 1 WHERE id = ?').run(id);
    return this.findById(id);
  }

  static markAllAsRead(feedId) {
    db.prepare('UPDATE rss_items SET is_read = 1 WHERE feed_id = ?').run(feedId);
  }

  static getUnreadCount(feedId) {
    const result = db.prepare('SELECT COUNT(*) as count FROM rss_items WHERE feed_id = ? AND is_read = 0').get(feedId);
    return result.count;
  }
}

module.exports = { RSSFeed, RSSItem };
