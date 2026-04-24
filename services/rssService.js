const Parser = require('rss-parser');
const { RSSFeed, RSSItem } = require('../models/RSSFeed');

const parser = new Parser({
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  },
  timeout: 30000
});

class RSSService {
  async fetchFeed(url) {
    try {
      const feed = await parser.parseURL(url);
      return {
        title: feed.title || '未知订阅源',
        description: feed.description || '',
        link: feed.link || url,
        items: feed.items || []
      };
    } catch (error) {
      console.error('获取 RSS 源失败:', error.message);
      throw new Error(`无法获取 RSS 源: ${error.message}`);
    }
  }

  async addFeed(userId, name, url) {
    const feedInfo = await this.fetchFeed(url);
    const feed = RSSFeed.create(userId, name || feedInfo.title, url);
    
    await this.fetchAndSaveItems(feed.id, feedInfo.items);
    
    return feed;
  }

  async fetchAndSaveItems(feedId, items) {
    for (const item of items.slice(0, 50)) {
      try {
        await RSSItem.create(feedId, {
          title: item.title || '无标题',
          link: item.link || item.guid || '',
          pubDate: item.pubDate ? new Date(item.pubDate).toISOString() : null,
          description: item.contentSnippet || item.description || '',
          content: item.content || item['content:encoded'] || ''
        });
      } catch (e) {}
    }
  }

  async updateFeed(feed) {
    try {
      const feedInfo = await this.fetchFeed(feed.url);
      await this.fetchAndSaveItems(feed.id, feedInfo.items);
      
      RSSFeed.update(feed.user_id, feed.id, {
        last_fetched: new Date().toISOString()
      });
      
      return true;
    } catch (error) {
      console.error(`更新 RSS 源 ${feed.id} 失败:`, error.message);
      return false;
    }
  }

  async updateAllFeeds() {
    const feeds = RSSFeed.getAllFeeds();
    const results = [];
    
    for (const feed of feeds) {
      const success = await this.updateFeed(feed);
      results.push({ feedId: feed.id, feedName: feed.name, success });
    }
    
    return results;
  }

  async getFeedWithItems(userId, feedId, options = {}) {
    const feed = RSSFeed.findById(userId, feedId);
    if (!feed) {
      throw new Error('订阅源不存在');
    }
    
    const items = RSSItem.findByFeedId(feedId, options);
    const unreadCount = RSSItem.getUnreadCount(feedId);
    
    return {
      ...feed,
      items,
      unreadCount
    };
  }

  async markItemAsRead(itemId) {
    return RSSItem.markAsRead(itemId);
  }

  async markAllAsRead(userId, feedId) {
    const feed = RSSFeed.findById(userId, feedId);
    if (!feed) {
      throw new Error('订阅源不存在');
    }
    
    RSSItem.markAllAsRead(feedId);
    return true;
  }
}

module.exports = new RSSService();
