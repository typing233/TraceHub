# TraceHub - AI 驱动的个人知识管理中枢

<p align="center">
  <strong>🧠 集全模态内容抓取、智能整理与全文检索于一体的自动化个人知识管理中枢</strong>
</p>

## 🌟 功能特性

### 📥 全模态内容采集
- **网页抓取**: 一键保存网页链接，自动提取正文内容
- **文本保存**: 直接输入或粘贴文本内容
- **文件上传**: 支持图片 (JPG/PNG/GIF/WebP)、PDF、文本文件
- **RSS 订阅**: 自动订阅 RSS 源，获取最新资讯

### 🤖 AI 智能整理 (Deepseek 集成)
- **自动摘要**: AI 自动生成内容摘要
- **智能标签**: 根据内容自动生成相关标签
- **内容分析**: 支持内容分类和情感分析
- **用户自定义 API Key**: 您的 API Key 安全存储在本地

### 🔍 全文检索
- **FTS5 全文检索引擎**: 基于 SQLite FTS5 的高性能全文搜索
- **多维度搜索**: 支持标题、内容、摘要、标签多维度搜索
- **搜索高亮**: 搜索结果关键词高亮显示

### 🖼️ OCR 文字识别
- **图片文字提取**: 自动识别图片中的文字内容
- **中英文支持**: 支持中文和英文识别
- **批量处理**: 上传时自动识别，也可手动触发

### 📰 RSS 订阅管理
- **多源订阅**: 支持添加多个 RSS 订阅源
- **自动刷新**: 定时自动刷新订阅内容
- **一键保存**: 将 RSS 文章一键保存到知识库

### ⚙️ 自定义规则引擎
- **条件触发**: 基于内容类型、标题、内容、URL 等条件
- **自动操作**: 自动添加标签、设置标题、添加摘要
- **灵活配置**: 规则可启用/禁用，支持实时调整

## 🛠️ 技术栈

### 后端
- **Node.js + Express**: 轻量级 Web 框架
- **SQLite + better-sqlite3**: 嵌入式数据库，FTS5 全文检索
- **Deepseek API**: AI 大模型服务
- **Tesseract.js**: OCR 文字识别
- **Cheerio**: HTML 解析
- **Node-cron**: 定时任务调度

### 前端
- **原生 HTML/CSS/JavaScript**: 现代化界面设计
- **响应式布局**: 支持桌面和移动设备
- **单页应用**: 流畅的用户体验

## 🚀 快速开始

### 环境要求
- Node.js 18.x 或更高版本
- npm 包管理器

### 安装步骤

1. **安装依赖**
```bash
npm install
```

2. **启动应用**
```bash
npm start
```

3. **访问应用**
打开浏览器访问: `http://localhost:2263`

### 首次使用

1. **注册账户**: 打开应用后，点击"注册"创建您的账户
2. **配置 AI 服务** (可选):
   - 登录后进入"设置"页面
   - 输入您的 Deepseek API Key
   - 点击"保存配置"

3. **开始使用**:
   - 通过"添加内容"保存网页、文本或文件
   - 添加 RSS 订阅源自动获取资讯
   - 使用全文检索快速查找内容

## 📋 API 接口

### 认证接口
- `POST /api/auth/register` - 用户注册
- `POST /api/auth/login` - 用户登录
- `POST /api/auth/logout` - 退出登录
- `GET /api/auth/me` - 获取当前用户信息
- `PUT /api/auth/api-key` - 更新 API Key

### 内容接口
- `GET /api/contents` - 获取内容列表
- `GET /api/contents/:id` - 获取内容详情
- `GET /api/contents/search` - 全文检索
- `GET /api/contents/stats` - 获取统计数据
- `POST /api/contents/url` - 保存网页 URL
- `POST /api/contents/text` - 保存文本内容
- `POST /api/contents/upload` - 上传文件
- `POST /api/contents/:id/process-ai` - AI 处理
- `POST /api/contents/:id/ocr` - OCR 识别
- `PUT /api/contents/:id` - 更新内容
- `DELETE /api/contents/:id` - 删除内容

### RSS 接口
- `GET /api/rss` - 获取订阅源列表
- `GET /api/rss/test` - 测试 RSS 源
- `GET /api/rss/:id` - 获取订阅源详情和文章
- `POST /api/rss` - 添加订阅源
- `POST /api/rss/:id/refresh` - 刷新订阅源
- `POST /api/rss/item/:itemId/read` - 标记已读
- `POST /api/rss/item/:itemId/save` - 保存到知识库
- `PUT /api/rss/:id` - 更新订阅源
- `DELETE /api/rss/:id` - 删除订阅源

### 规则接口
- `GET /api/rules` - 获取规则列表
- `GET /api/rules/types` - 获取条件和操作类型
- `GET /api/rules/:id` - 获取规则详情
- `POST /api/rules` - 创建规则
- `POST /api/rules/test` - 测试规则
- `PUT /api/rules/:id` - 更新规则
- `DELETE /api/rules/:id` - 删除规则

## 🔧 配置说明

### Deepseek API Key 配置

要使用 AI 功能（自动摘要、标签生成等），需要配置 Deepseek API Key：

1. 访问 [Deepseek 开放平台](https://platform.deepseek.com/)
2. 注册/登录账户
3. 在控制台获取 API Key
4. 在 TraceHub 的"设置"页面输入并保存

### 定时任务

应用内置两个定时任务：
- **RSS 刷新**: 每 6 小时自动刷新所有订阅源
- **会话清理**: 每天凌晨 3 点清理过期登录会话

## 📁 项目结构

```
TraceHub/
├── server.js                 # 主服务器入口
├── package.json              # 项目配置
├── README.md                # 项目文档
├── database/
│   ├── db.js               # 数据库连接
│   └── init.js             # 数据库初始化
├── models/
│   ├── User.js             # 用户模型
│   ├── Content.js          # 内容模型
│   ├── RSSFeed.js          # RSS 模型
│   └── Rule.js             # 规则模型
├── services/
│   ├── aiService.js        # AI 服务 (Deepseek)
│   ├── ocrService.js       # OCR 服务
│   ├── contentExtractor.js # 内容提取服务
│   └── rssService.js       # RSS 服务
├── routes/
│   ├── auth.js             # 认证路由
│   ├── content.js          # 内容路由
│   ├── rss.js              # RSS 路由
│   └── rules.js            # 规则路由
├── middleware/
│   └── auth.js             # 认证中间件
├── public/
│   ├── index.html          # 主页面
│   ├── css/
│   │   └── style.css       # 样式文件
│   └── js/
│       └── app.js          # 前端应用
├── data/                   # 数据存储目录 (运行时生成)
│   ├── tracehub.db        # SQLite 数据库
│   └── uploads/            # 上传文件存储
└── tests/                  # 测试文件
```

## 🧪 测试用例

### 功能测试

#### 1. 用户认证
- [ ] 用户注册 (用户名: 3-20 字符，密码: 至少 6 字符)
- [ ] 用户登录 (正确的用户名和密码)
- [ ] 登录失败 (错误的用户名或密码)
- [ ] 退出登录
- [ ] 会话过期处理

#### 2. 内容管理
- [ ] 保存网页 URL
- [ ] 保存文本内容
- [ ] 上传图片文件
- [ ] 上传 PDF 文件
- [ ] 上传文本文件
- [ ] 查看内容详情
- [ ] 编辑内容
- [ ] 删除内容
- [ ] 内容列表分页
- [ ] 按类型筛选内容

#### 3. AI 功能
- [ ] 配置 Deepseek API Key
- [ ] 自动生成摘要
- [ ] 自动生成标签
- [ ] 手动触发 AI 处理
- [ ] API Key 错误处理

#### 4. OCR 功能
- [ ] 图片文字自动识别
- [ ] 手动触发 OCR 识别
- [ ] OCR 错误处理

#### 5. 全文检索
- [ ] 搜索关键词 (至少 2 字符)
- [ ] 搜索结果高亮
- [ ] 空搜索词处理
- [ ] 无结果提示

#### 6. RSS 订阅
- [ ] 测试 RSS 源
- [ ] 添加 RSS 订阅源
- [ ] 查看订阅源文章列表
- [ ] 刷新订阅源
- [ ] 标记文章已读
- [ ] 保存 RSS 文章到知识库
- [ ] 删除订阅源

#### 7. 规则引擎
- [ ] 获取条件和操作类型
- [ ] 创建规则
- [ ] 测试规则匹配
- [ ] 启用/禁用规则
- [ ] 删除规则

#### 8. 界面测试
- [ ] 登录页面显示
- [ ] 注册页面显示
- [ ] 仪表盘数据统计
- [ ] 侧边栏导航
- [ ] 响应式布局 (桌面端)
- [ ] 响应式布局 (移动端)
- [ ] 模态框显示
- [ ] Toast 通知

### API 测试

#### 认证接口
```bash
# 注册
curl -X POST http://localhost:2263/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"123456"}'

# 登录
curl -X POST http://localhost:2263/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"123456"}'
```

#### 内容接口
```bash
# 获取内容列表
curl http://localhost:2263/api/contents \
  -H "Authorization: Bearer <token>"

# 搜索内容
curl "http://localhost:2263/api/contents/search?q=关键词" \
  -H "Authorization: Bearer <token>"

# 保存网页
curl -X POST http://localhost:2263/api/contents/url \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"url":"https://example.com","auto_ai":true}'
```

## 📝 更新日志

### v1.0.0 (2026-04-24)
- ✅ 核心功能发布
- ✅ 用户认证系统
- ✅ 多模态内容采集 (网页、文本、图片、PDF)
- ✅ Deepseek AI 集成 (摘要、标签生成)
- ✅ OCR 文字识别
- ✅ FTS5 全文检索
- ✅ RSS 订阅管理
- ✅ 自定义规则引擎
- ✅ 现代化前端界面
- ✅ 响应式布局设计

## ⚠️ 注意事项

1. **API Key 安全**: Deepseek API Key 存储在本地数据库，请妥善保管
2. **文件大小限制**: 单文件上传限制为 50MB
3. **OCR 性能**: 大图片 OCR 可能需要较长时间
4. **AI 调用**: AI 处理需要网络连接和有效的 API Key
5. **数据库**: SQLite 数据库文件存储在 `data/tracehub.db`，建议定期备份

## 📄 开源协议

MIT License

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

---

<p align="center">
  Made with ❤️ by TraceHub Team
</p>
