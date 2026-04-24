const db = require('../database/db');

class Content {
  static create(userId, data) {
    const { title, content_type, url, raw_content, extracted_text, summary, tags, file_path } = data;
    
    const result = db.prepare(`
      INSERT INTO contents (user_id, title, content_type, url, raw_content, extracted_text, summary, tags, file_path)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(userId, title, content_type, url, raw_content, extracted_text, summary, tags, file_path);
    
    const contentId = result.lastInsertRowid;
    
    this.updateFTS(contentId, { title, extracted_text, summary, tags });
    
    return this.findById(userId, contentId);
  }

  static findById(userId, id) {
    return db.prepare('SELECT * FROM contents WHERE id = ? AND user_id = ?').get(id, userId);
  }

  static findAllByUserId(userId, options = {}) {
    const { content_type, limit = 50, offset = 0, search } = options;
    
    let query = 'SELECT * FROM contents WHERE user_id = ?';
    const params = [userId];
    
    if (content_type) {
      query += ' AND content_type = ?';
      params.push(content_type);
    }
    
    if (search && search.trim().length >= 2) {
      query += ' AND id IN (SELECT rowid FROM contents_fts WHERE contents_fts MATCH ?)';
      params.push(search.trim());
    }
    
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    
    return db.prepare(query).all(...params);
  }

  static search(userId, query, options = {}) {
    const { limit = 50, offset = 0 } = options;
    
    if (!query || query.trim().length < 2) {
      return [];
    }
    
    const searchQuery = query.trim();
    
    try {
      const results = db.prepare(`
        SELECT c.*
        FROM contents c
        WHERE c.user_id = ? AND c.id IN (
          SELECT rowid FROM contents_fts WHERE contents_fts MATCH ?
        )
        ORDER BY c.created_at DESC
        LIMIT ? OFFSET ?
      `).all(userId, searchQuery, limit, offset);
      
      return results;
    } catch (error) {
      console.warn('FTS 搜索失败，回退到普通搜索:', error.message);
      const likeQuery = `%${searchQuery}%`;
      return db.prepare(`
        SELECT * FROM contents 
        WHERE user_id = ? 
        AND (title LIKE ? OR extracted_text LIKE ? OR summary LIKE ? OR tags LIKE ?)
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `).all(userId, likeQuery, likeQuery, likeQuery, likeQuery, limit, offset);
    }
  }

  static update(userId, id, data) {
    const fields = [];
    const values = [];
    
    const allowedFields = ['title', 'url', 'raw_content', 'extracted_text', 'summary', 'tags', 'file_path'];
    
    for (const field of allowedFields) {
      if (data[field] !== undefined) {
        fields.push(`${field} = ?`);
        values.push(data[field]);
      }
    }
    
    if (fields.length === 0) {
      return this.findById(userId, id);
    }
    
    fields.push("updated_at = datetime('now')");
    values.push(id, userId);
    
    db.prepare(`
      UPDATE contents SET ${fields.join(', ')} WHERE id = ? AND user_id = ?
    `).run(...values);
    
    const content = this.findById(userId, id);
    if (content) {
      this.updateFTS(id, {
        title: content.title,
        extracted_text: content.extracted_text,
        summary: content.summary,
        tags: content.tags
      });
    }
    
    return this.findById(userId, id);
  }

  static delete(userId, id) {
    const content = this.findById(userId, id);
    if (!content) {
      return false;
    }
    
    try {
      db.prepare('DELETE FROM contents_fts WHERE rowid = ?').run(id);
    } catch (error) {
      console.warn('删除 FTS 记录失败:', error.message);
    }
    
    db.prepare('DELETE FROM contents WHERE id = ? AND user_id = ?').run(id, userId);
    
    return true;
  }

  static updateFTS(contentId, data) {
    const { title, extracted_text, summary, tags } = data;
    
    try {
      const existing = db.prepare('SELECT rowid FROM contents_fts WHERE rowid = ?').get(contentId);
      
      if (existing) {
        db.prepare(`
          UPDATE contents_fts SET title = ?, extracted_text = ?, summary = ?, tags = ?
          WHERE rowid = ?
        `).run(title || '', extracted_text || '', summary || '', tags || '', contentId);
      } else {
        db.prepare(`
          INSERT INTO contents_fts (rowid, title, extracted_text, summary, tags)
          VALUES (?, ?, ?, ?, ?)
        `).run(contentId, title || '', extracted_text || '', summary || '', tags || '');
      }
    } catch (error) {
      console.warn('FTS 更新失败:', error.message);
    }
  }

  static getStats(userId) {
    const byType = db.prepare(`
      SELECT content_type, COUNT(*) as count
      FROM contents WHERE user_id = ?
      GROUP BY content_type
    `).all(userId);
    
    const total = db.prepare('SELECT COUNT(*) as count FROM contents WHERE user_id = ?').get(userId);
    
    const recent = db.prepare(`
      SELECT COUNT(*) as count FROM contents 
      WHERE user_id = ? AND created_at >= datetime('now', '-7 days')
    `).get(userId);
    
    return {
      total: total.count,
      recent: recent.count,
      byType
    };
  }
}

module.exports = Content;
