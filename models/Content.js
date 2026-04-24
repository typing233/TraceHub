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
    
    if (!search || search.trim().length < 2) {
      let query = 'SELECT * FROM contents WHERE user_id = ?';
      const params = [userId];
      
      if (content_type) {
        query += ' AND content_type = ?';
        params.push(content_type);
      }
      
      query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);
      
      return db.prepare(query).all(...params);
    }
    
    const searchQuery = search.trim();
    
    try {
      let ftsQuery = 'SELECT * FROM contents WHERE user_id = ?';
      const ftsParams = [userId];
      
      if (content_type) {
        ftsQuery += ' AND content_type = ?';
        ftsParams.push(content_type);
      }
      
      ftsQuery += ' AND id IN (SELECT rowid FROM contents_fts WHERE contents_fts MATCH ?)';
      ftsParams.push(searchQuery);
      
      ftsQuery += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
      ftsParams.push(limit, offset);
      
      const ftsResults = db.prepare(ftsQuery).all(...ftsParams);
      
      if (ftsResults.length > 0) {
        return ftsResults;
      }
      
      console.log('内容列表 FTS 搜索返回空结果，尝试 LIKE 查询');
    } catch (error) {
      console.warn('内容列表 FTS 搜索失败，回退到 LIKE 查询:', error.message);
    }
    
    let likeQuery = 'SELECT * FROM contents WHERE user_id = ?';
    const likeParams = [userId];
    
    if (content_type) {
      likeQuery += ' AND content_type = ?';
      likeParams.push(content_type);
    }
    
    const likeSearch = `%${searchQuery}%`;
    likeQuery += ' AND (title LIKE ? OR extracted_text LIKE ? OR summary LIKE ? OR tags LIKE ?)';
    likeParams.push(likeSearch, likeSearch, likeSearch, likeSearch);
    
    likeQuery += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    likeParams.push(limit, offset);
    
    return db.prepare(likeQuery).all(...likeParams);
  }

  static search(userId, query, options = {}) {
    const { limit = 50, offset = 0 } = options;
    
    if (!query || query.trim().length < 2) {
      return [];
    }
    
    const searchQuery = query.trim();
    
    try {
      const ftsResults = db.prepare(`
        SELECT c.*
        FROM contents c
        WHERE c.user_id = ? AND c.id IN (
          SELECT rowid FROM contents_fts WHERE contents_fts MATCH ?
        )
        ORDER BY c.created_at DESC
        LIMIT ? OFFSET ?
      `).all(userId, searchQuery, limit, offset);
      
      if (ftsResults.length > 0) {
        return ftsResults;
      }
      
      console.log('FTS 搜索返回空结果，尝试 LIKE 查询（中文支持更好）');
    } catch (error) {
      console.warn('FTS 搜索失败，回退到普通搜索:', error.message);
    }
    
    const likeQuery = `%${searchQuery}%`;
    return db.prepare(`
      SELECT * FROM contents 
      WHERE user_id = ? 
      AND (title LIKE ? OR extracted_text LIKE ? OR summary LIKE ? OR tags LIKE ?)
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(userId, likeQuery, likeQuery, likeQuery, likeQuery, limit, offset);
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
