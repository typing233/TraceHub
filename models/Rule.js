const db = require('../database/db');

class Rule {
  static create(userId, data) {
    const { name, condition_type, condition_value, action_type, action_value } = data;
    
    const result = db.prepare(`
      INSERT INTO rules (user_id, name, condition_type, condition_value, action_type, action_value)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(userId, name, condition_type, condition_value, action_type, action_value);
    
    return this.findById(userId, result.lastInsertRowid);
  }

  static findById(userId, id) {
    return db.prepare('SELECT * FROM rules WHERE id = ? AND user_id = ?').get(id, userId);
  }

  static findAllByUserId(userId, options = {}) {
    const { activeOnly = false } = options;
    
    let query = 'SELECT * FROM rules WHERE user_id = ?';
    const params = [userId];
    
    if (activeOnly) {
      query += ' AND is_active = 1';
    }
    
    query += ' ORDER BY created_at DESC';
    
    return db.prepare(query).all(...params);
  }

  static update(userId, id, data) {
    const fields = [];
    const values = [];
    
    const allowedFields = ['name', 'condition_type', 'condition_value', 'action_type', 'action_value', 'is_active'];
    
    for (const field of allowedFields) {
      if (data[field] !== undefined) {
        fields.push(`${field} = ?`);
        values.push(data[field]);
      }
    }
    
    if (fields.length === 0) {
      return this.findById(userId, id);
    }
    
    values.push(id, userId);
    
    db.prepare(`
      UPDATE rules SET ${fields.join(', ')} WHERE id = ? AND user_id = ?
    `).run(...values);
    
    return this.findById(userId, id);
  }

  static delete(userId, id) {
    const result = db.prepare('DELETE FROM rules WHERE id = ? AND user_id = ?').run(id, userId);
    return result.changes > 0;
  }

  static evaluate(content, rules) {
    const matchedActions = [];
    
    for (const rule of rules) {
      if (!rule.is_active) continue;
      
      let matched = false;
      
      switch (rule.condition_type) {
        case 'content_type':
          matched = content.content_type === rule.condition_value;
          break;
        case 'title_contains':
          matched = content.title && content.title.toLowerCase().includes(rule.condition_value.toLowerCase());
          break;
        case 'content_contains':
          matched = (content.raw_content || '').toLowerCase().includes(rule.condition_value.toLowerCase()) ||
                   (content.extracted_text || '').toLowerCase().includes(rule.condition_value.toLowerCase());
          break;
        case 'url_contains':
          matched = content.url && content.url.toLowerCase().includes(rule.condition_value.toLowerCase());
          break;
        default:
          continue;
      }
      
      if (matched) {
        matchedActions.push({
          ruleId: rule.id,
          ruleName: rule.name,
          actionType: rule.action_type,
          actionValue: rule.action_value
        });
      }
    }
    
    return matchedActions;
  }

  static applyActions(content, actions) {
    const updates = {};
    
    for (const action of actions) {
      switch (action.actionType) {
        case 'add_tag':
          if (action.actionValue) {
            const currentTags = content.tags ? content.tags.split(',').map(t => t.trim()) : [];
            if (!currentTags.includes(action.actionValue)) {
              currentTags.push(action.actionValue);
              updates.tags = currentTags.join(', ');
            }
          }
          break;
        case 'set_title':
          if (action.actionValue) {
            updates.title = action.actionValue;
          }
          break;
        case 'add_summary':
          if (action.actionValue) {
            updates.summary = (content.summary || '') + (content.summary ? '\n' : '') + action.actionValue;
          }
          break;
        default:
          break;
      }
    }
    
    return updates;
  }
}

module.exports = Rule;
