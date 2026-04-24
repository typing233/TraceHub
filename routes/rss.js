const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { RSSFeed, RSSItem } = require('../models/RSSFeed');
const rssService = require('../services/rssService');
const Content = require('../models/Content');
const AIService = require('../services/aiService');
const Rule = require('../models/Rule');

router.get('/', authMiddleware, async (req, res) => {
  try {
    const feeds = RSSFeed.findAllByUserId(req.user.id);
    
    const feedsWithUnread = feeds.map(feed => ({
      ...feed,
      unreadCount: RSSItem.getUnreadCount(feed.id)
    }));
    
    res.json({
      success: true,
      data: feedsWithUnread
    });
  } catch (error) {
    console.error('获取 RSS 订阅源错误:', error);
    res.status(500).json({
      success: false,
      error: '服务器错误'
    });
  }
});

router.get('/test', authMiddleware, async (req, res) => {
  try {
    const { url } = req.query;
    
    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL 不能为空'
      });
    }
    
    const feedInfo = await rssService.fetchFeed(url);
    
    res.json({
      success: true,
      data: {
        title: feedInfo.title,
        description: feedInfo.description,
        link: feedInfo.link,
        itemCount: feedInfo.items.length,
        sampleItems: feedInfo.items.slice(0, 3)
      }
    });
  } catch (error) {
    console.error('测试 RSS 源错误:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    const { name, url } = req.body;
    
    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL 不能为空'
      });
    }
    
    const feed = await rssService.addFeed(req.user.id, name, url);
    
    res.json({
      success: true,
      data: feed,
      message: `已添加订阅源: ${feed.name}`
    });
  } catch (error) {
    console.error('添加 RSS 源错误:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { limit = 50, offset = 0, unread_only = false } = req.query;
    
    const feedWithItems = await rssService.getFeedWithItems(
      req.user.id, 
      parseInt(req.params.id),
      {
        limit: parseInt(limit),
        offset: parseInt(offset),
        unreadOnly: unread_only === 'true'
      }
    );
    
    res.json({
      success: true,
      data: feedWithItems
    });
  } catch (error) {
    console.error('获取 RSS 详情错误:', error);
    res.status(404).json({
      success: false,
      error: error.message
    });
  }
});

router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { name, url } = req.body;
    
    const feed = RSSFeed.findById(req.user.id, parseInt(req.params.id));
    if (!feed) {
      return res.status(404).json({
        success: false,
        error: '订阅源不存在'
      });
    }
    
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (url !== undefined) updates.url = url;
    
    const updatedFeed = RSSFeed.update(req.user.id, feed.id, updates);
    
    res.json({
      success: true,
      data: updatedFeed,
      message: '已更新'
    });
  } catch (error) {
    console.error('更新 RSS 源错误:', error);
    res.status(500).json({
      success: false,
      error: '服务器错误'
    });
  }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const deleted = RSSFeed.delete(req.user.id, parseInt(req.params.id));
    
    res.json({
      success: deleted,
      message: deleted ? '已删除' : '删除失败'
    });
  } catch (error) {
    console.error('删除 RSS 源错误:', error);
    res.status(500).json({
      success: false,
      error: '服务器错误'
    });
  }
});

router.post('/:id/refresh', authMiddleware, async (req, res) => {
  try {
    const feed = RSSFeed.findById(req.user.id, parseInt(req.params.id));
    if (!feed) {
      return res.status(404).json({
        success: false,
        error: '订阅源不存在'
      });
    }
    
    const success = await rssService.updateFeed(feed);
    
    res.json({
      success,
      message: success ? '已刷新' : '刷新失败'
    });
  } catch (error) {
    console.error('刷新 RSS 源错误:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.post('/item/:itemId/read', authMiddleware, async (req, res) => {
  try {
    const item = RSSItem.markAsRead(parseInt(req.params.itemId));
    
    if (!item) {
      return res.status(404).json({
        success: false,
        error: '文章不存在'
      });
    }
    
    res.json({
      success: true,
      data: item
    });
  } catch (error) {
    console.error('标记已读错误:', error);
    res.status(500).json({
      success: false,
      error: '服务器错误'
    });
  }
});

router.post('/:id/mark-all-read', authMiddleware, async (req, res) => {
  try {
    await rssService.markAllAsRead(req.user.id, parseInt(req.params.id));
    
    res.json({
      success: true,
      message: '已全部标记为已读'
    });
  } catch (error) {
    console.error('标记全部已读错误:', error);
    res.status(404).json({
      success: false,
      error: error.message
    });
  }
});

router.post('/item/:itemId/save', authMiddleware, async (req, res) => {
  try {
    const { auto_ai = true } = req.body;
    const itemId = parseInt(req.params.itemId);
    
    const item = RSSItem.findById(itemId);
    if (!item) {
      return res.status(404).json({
        success: false,
        error: '文章不存在'
      });
    }
    
    const contentData = {
      title: item.title || 'RSS 文章',
      content_type: 'webpage',
      url: item.link,
      raw_content: item.content || item.description,
      extracted_text: item.content || item.description
    };
    
    const rules = Rule.findAllByUserId(req.user.id, { activeOnly: true });
    const matchedActions = Rule.evaluate(contentData, rules);
    const ruleUpdates = Rule.applyActions(contentData, matchedActions);
    
    Object.assign(contentData, ruleUpdates);
    
    let content = Content.create(req.user.id, contentData);
    
    if (auto_ai && req.user.deepseekApiKey) {
      const aiService = new AIService(req.user.deepseekApiKey);
      const aiResult = await aiService.processContent({
        title: content.title,
        raw_content: content.raw_content,
        extracted_text: content.extracted_text,
        content_type: content.content_type,
        tags: content.tags
      });
      
      content = Content.update(req.user.id, content.id, aiResult);
    }
    
    RSSItem.markAsRead(itemId);
    
    res.json({
      success: true,
      data: content,
      message: `已保存到知识库: ${content.title}`
    });
  } catch (error) {
    console.error('保存 RSS 文章错误:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
