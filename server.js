const express = require('express');
const path = require('path');
const cors = require('cors');
const cron = require('node-cron');

const authRoutes = require('./routes/auth');
const contentRoutes = require('./routes/content');
const rssRoutes = require('./routes/rss');
const rulesRoutes = require('./routes/rules');

const db = require('./database/db');
const User = require('./models/User');
const rssService = require('./services/rssService');

const app = express();
const PORT = process.env.PORT || 2263;

app.use(cors({
  credentials: true,
  origin: true
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', authRoutes);
app.use('/api/contents', contentRoutes);
app.use('/api/rss', rssRoutes);
app.use('/api/rules', rulesRoutes);

app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    data: {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    }
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((err, req, res, next) => {
  console.error('错误:', err.stack);
  
  if (err.type === 'entity.too.large') {
    return res.status(413).json({
      success: false,
      error: '上传的文件太大'
    });
  }
  
  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' ? '服务器错误' : err.message
  });
});

const initDatabase = () => {
  try {
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

    try {
      const testFts = db.prepare("SELECT 1 FROM contents_fts LIMIT 1").get();
      console.log('FTS 表已存在且正常');
    } catch (e) {
      console.log('FTS 表损坏或不存在，正在重建...');
      try {
        db.exec("DROP TABLE IF EXISTS contents_fts");
      } catch (dropError) {
        console.log('删除旧 FTS 表时出错，可能表不存在:', dropError.message);
      }
      
      try {
        db.exec(`
          CREATE VIRTUAL TABLE contents_fts USING fts5(
            title,
            extracted_text,
            summary,
            tags
          );
        `);
        console.log('FTS 表创建成功');
        
        console.log('正在重建 FTS 索引...');
        const allContents = db.prepare('SELECT id, title, extracted_text, summary, tags FROM contents').all();
        let rebuiltCount = 0;
        for (const content of allContents) {
          try {
            db.prepare(`
              INSERT INTO contents_fts (rowid, title, extracted_text, summary, tags)
              VALUES (?, ?, ?, ?, ?)
            `).run(
              content.id, 
              content.title || '', 
              content.extracted_text || '', 
              content.summary || '', 
              content.tags || ''
            );
            rebuiltCount++;
          } catch (insertErr) {
            console.warn(`重建内容 ${content.id} 的 FTS 索引失败:`, insertErr.message);
          }
        }
        console.log(`FTS 索引重建完成，共 ${rebuiltCount} 条记录`);
      } catch (createError) {
        console.error('创建 FTS 表失败:', createError.message);
        console.log('全文检索功能将不可用，将使用普通搜索作为后备');
      }
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
  } catch (error) {
    console.error('数据库初始化失败:', error);
  }
};

const initScheduledTasks = () => {
  cron.schedule('0 */6 * * *', async () => {
    console.log('执行定时任务: 刷新 RSS 订阅源');
    try {
      const results = await rssService.updateAllFeeds();
      console.log(`RSS 刷新完成: ${results.filter(r => r.success).length}/${results.length} 成功`);
    } catch (error) {
      console.error('RSS 刷新任务失败:', error);
    }
  });

  cron.schedule('0 3 * * *', () => {
    console.log('执行定时任务: 清理过期会话');
    User.deleteExpiredSessions();
  });

  console.log('定时任务已初始化');
};

const server = app.listen(PORT, () => {
  console.log(`\n========================================`);
  console.log(`  TraceHub 知识管理中枢已启动`);
  console.log(`========================================`);
  console.log(`  本地访问: http://localhost:${PORT}`);
  console.log(`  环境: ${process.env.NODE_ENV || 'development'}`);
  console.log(`  启动时间: ${new Date().toLocaleString()}`);
  console.log(`========================================\n`);
});

initDatabase();
initScheduledTasks();

process.on('SIGTERM', () => {
  console.log('收到 SIGTERM 信号，正在关闭服务器...');
  server.close(() => {
    console.log('服务器已关闭');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('收到 SIGINT 信号，正在关闭服务器...');
  server.close(() => {
    console.log('服务器已关闭');
    process.exit(0);
  });
});

module.exports = app;
