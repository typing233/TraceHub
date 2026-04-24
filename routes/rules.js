const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const Rule = require('../models/Rule');

const conditionTypes = [
  { value: 'content_type', label: '内容类型', description: '根据内容类型匹配' },
  { value: 'title_contains', label: '标题包含', description: '标题中包含指定关键词' },
  { value: 'content_contains', label: '内容包含', description: '内容中包含指定关键词' },
  { value: 'url_contains', label: 'URL 包含', description: 'URL 中包含指定关键词' }
];

const actionTypes = [
  { value: 'add_tag', label: '添加标签', description: '自动添加指定标签' },
  { value: 'set_title', label: '设置标题', description: '设置自定义标题' },
  { value: 'add_summary', label: '添加摘要', description: '添加自定义摘要内容' }
];

router.get('/types', authMiddleware, (req, res) => {
  res.json({
    success: true,
    data: {
      conditionTypes,
      actionTypes
    }
  });
});

router.get('/', authMiddleware, async (req, res) => {
  try {
    const { active_only } = req.query;
    
    const rules = Rule.findAllByUserId(req.user.id, {
      activeOnly: active_only === 'true'
    });
    
    res.json({
      success: true,
      data: rules
    });
  } catch (error) {
    console.error('获取规则列表错误:', error);
    res.status(500).json({
      success: false,
      error: '服务器错误'
    });
  }
});

router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const rule = Rule.findById(req.user.id, parseInt(req.params.id));
    
    if (!rule) {
      return res.status(404).json({
        success: false,
        error: '规则不存在'
      });
    }
    
    res.json({
      success: true,
      data: rule
    });
  } catch (error) {
    console.error('获取规则错误:', error);
    res.status(500).json({
      success: false,
      error: '服务器错误'
    });
  }
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    const { name, condition_type, condition_value, action_type, action_value } = req.body;
    
    if (!name || !condition_type || !action_type) {
      return res.status(400).json({
        success: false,
        error: '规则名称、条件类型和操作类型不能为空'
      });
    }
    
    const validConditionTypes = conditionTypes.map(t => t.value);
    if (!validConditionTypes.includes(condition_type)) {
      return res.status(400).json({
        success: false,
        error: '无效的条件类型'
      });
    }
    
    const validActionTypes = actionTypes.map(t => t.value);
    if (!validActionTypes.includes(action_type)) {
      return res.status(400).json({
        success: false,
        error: '无效的操作类型'
      });
    }
    
    const rule = Rule.create(req.user.id, {
      name,
      condition_type,
      condition_value,
      action_type,
      action_value
    });
    
    res.json({
      success: true,
      data: rule,
      message: `已创建规则: ${rule.name}`
    });
  } catch (error) {
    console.error('创建规则错误:', error);
    res.status(500).json({
      success: false,
      error: '服务器错误'
    });
  }
});

router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { name, condition_type, condition_value, action_type, action_value, is_active } = req.body;
    
    const rule = Rule.findById(req.user.id, parseInt(req.params.id));
    if (!rule) {
      return res.status(404).json({
        success: false,
        error: '规则不存在'
      });
    }
    
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (condition_type !== undefined) updates.condition_type = condition_type;
    if (condition_value !== undefined) updates.condition_value = condition_value;
    if (action_type !== undefined) updates.action_type = action_type;
    if (action_value !== undefined) updates.action_value = action_value;
    if (is_active !== undefined) updates.is_active = is_active ? 1 : 0;
    
    const updatedRule = Rule.update(req.user.id, rule.id, updates);
    
    res.json({
      success: true,
      data: updatedRule,
      message: '已更新规则'
    });
  } catch (error) {
    console.error('更新规则错误:', error);
    res.status(500).json({
      success: false,
      error: '服务器错误'
    });
  }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const deleted = Rule.delete(req.user.id, parseInt(req.params.id));
    
    res.json({
      success: deleted,
      message: deleted ? '已删除规则' : '删除失败'
    });
  } catch (error) {
    console.error('删除规则错误:', error);
    res.status(500).json({
      success: false,
      error: '服务器错误'
    });
  }
});

router.post('/test', authMiddleware, async (req, res) => {
  try {
    const { condition_type, condition_value, test_content } = req.body;
    
    if (!test_content) {
      return res.status(400).json({
        success: false,
        error: '测试内容不能为空'
      });
    }
    
    const testData = {
      content_type: test_content.content_type || 'text',
      title: test_content.title || '',
      raw_content: test_content.content || '',
      extracted_text: test_content.content || '',
      url: test_content.url || ''
    };
    
    const tempRule = {
      id: 0,
      name: '测试规则',
      condition_type,
      condition_value,
      is_active: 1
    };
    
    const matched = Rule.evaluate(testData, [tempRule]);
    
    res.json({
      success: true,
      data: {
        matched: matched.length > 0,
        actions: matched,
        testData
      },
      message: matched.length > 0 ? '规则匹配成功' : '规则未匹配'
    });
  } catch (error) {
    console.error('测试规则错误:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
