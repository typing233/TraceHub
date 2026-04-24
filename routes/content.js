const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { authMiddleware } = require('../middleware/auth');
const Content = require('../models/Content');
const Rule = require('../models/Rule');
const contentExtractor = require('../services/contentExtractor');
const ocrService = require('../services/ocrService');
const AIService = require('../services/aiService');

const uploadDir = path.join(__dirname, '..', 'data', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `file-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'application/pdf', 'text/plain'
    ];
    if (allowedTypes.includes(file.mimetype) || 
        file.originalname.endsWith('.pdf') || 
        file.originalname.endsWith('.txt')) {
      cb(null, true);
    } else {
      cb(new Error('不支持的文件类型'), false);
    }
  }
});

router.get('/', authMiddleware, async (req, res) => {
  try {
    const { content_type, search, limit = 50, offset = 0 } = req.query;
    
    const options = {
      content_type,
      limit: parseInt(limit),
      offset: parseInt(offset)
    };
    
    const contents = Content.findAllByUserId(req.user.id, options);
    const stats = Content.getStats(req.user.id);
    
    res.json({
      success: true,
      data: {
        contents,
        stats,
        pagination: {
          limit: options.limit,
          offset: options.offset,
          total: contents.length
        }
      }
    });
  } catch (error) {
    console.error('获取内容列表错误:', error);
    res.status(500).json({
      success: false,
      error: '服务器错误'
    });
  }
});

router.get('/search', authMiddleware, async (req, res) => {
  try {
    const { q, limit = 50, offset = 0 } = req.query;
    
    if (!q || q.trim().length < 2) {
      return res.status(400).json({
        success: false,
        error: '搜索关键词至少需要 2 个字符'
      });
    }
    
    const results = Content.search(req.user.id, q.trim(), {
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
    
    res.json({
      success: true,
      data: {
        results,
        query: q,
        total: results.length
      }
    });
  } catch (error) {
    console.error('搜索错误:', error);
    res.status(500).json({
      success: false,
      error: '搜索失败: ' + error.message
    });
  }
});

router.get('/stats', authMiddleware, async (req, res) => {
  try {
    const stats = Content.getStats(req.user.id);
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('获取统计错误:', error);
    res.status(500).json({
      success: false,
      error: '服务器错误'
    });
  }
});

router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const content = Content.findById(req.user.id, parseInt(req.params.id));
    
    if (!content) {
      return res.status(404).json({
        success: false,
        error: '内容不存在'
      });
    }
    
    res.json({
      success: true,
      data: content
    });
  } catch (error) {
    console.error('获取内容错误:', error);
    res.status(500).json({
      success: false,
      error: '服务器错误'
    });
  }
});

router.post('/url', authMiddleware, async (req, res) => {
  try {
    const { url, auto_ai = true, full_content = false } = req.body;
    
    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL 不能为空'
      });
    }
    
    const extracted = await contentExtractor.extractFromUrl(url, { fullContent: full_content });
    
    const contentData = {
      title: extracted.title,
      content_type: extracted.content_type,
      url: url,
      raw_content: extracted.raw_content || extracted.content,
      extracted_text: extracted.content
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
    
    res.json({
      success: true,
      data: content,
      message: `已保存: ${content.title}`
    });
  } catch (error) {
    console.error('保存 URL 内容错误:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

router.post('/text', authMiddleware, async (req, res) => {
  try {
    const { title, text, tags, auto_ai = true } = req.body;
    
    if (!text || text.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: '文本内容不能为空'
      });
    }
    
    const contentData = {
      title: title || contentExtractor.extractTitleFromText(text),
      content_type: 'text',
      raw_content: text,
      extracted_text: text,
      tags: tags
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
    
    res.json({
      success: true,
      data: content,
      message: `已保存: ${content.title}`
    });
  } catch (error) {
    console.error('保存文本错误:', error);
    res.status(500).json({
      success: false,
      error: '服务器错误'
    });
  }
});

router.post('/upload', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: '请选择要上传的文件'
      });
    }
    
    const { auto_ai = true, auto_ocr = true } = req.body;
    const file = req.file;
    
    let contentData = {
      title: file.originalname,
      file_path: file.path
    };
    
    if (file.mimetype === 'application/pdf' || file.originalname.endsWith('.pdf')) {
      const extracted = await contentExtractor.extractFromPdfFile(file.path);
      contentData.content_type = 'pdf';
      contentData.extracted_text = extracted.content;
      contentData.raw_content = extracted.content;
      if (extracted.title && extracted.title !== 'PDF 文档') {
        contentData.title = extracted.title;
      }
    } else if (file.mimetype === 'text/plain' || file.originalname.endsWith('.txt')) {
      const text = fs.readFileSync(file.path, 'utf-8');
      contentData.content_type = 'text';
      contentData.extracted_text = text;
      contentData.raw_content = text;
      contentData.title = contentExtractor.extractTitleFromText(text);
    } else if (file.mimetype.startsWith('image/')) {
      contentData.content_type = 'image';
      contentData.extracted_text = '';
      contentData.raw_content = '';
      
      if (auto_ocr) {
        try {
          const ocrText = await ocrService.recognizeImage(file.path);
          contentData.extracted_text = ocrText;
          contentData.raw_content = ocrText;
        } catch (ocrError) {
          console.warn('OCR 识别失败:', ocrError.message);
        }
      }
    } else {
      return res.status(400).json({
        success: false,
        error: '不支持的文件类型'
      });
    }
    
    const rules = Rule.findAllByUserId(req.user.id, { activeOnly: true });
    const matchedActions = Rule.evaluate(contentData, rules);
    const ruleUpdates = Rule.applyActions(contentData, matchedActions);
    
    Object.assign(contentData, ruleUpdates);
    
    let content = Content.create(req.user.id, contentData);
    
    if (auto_ai && req.user.deepseekApiKey && content.extracted_text) {
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
    
    res.json({
      success: true,
      data: content,
      message: `已上传: ${content.title}`
    });
  } catch (error) {
    console.error('上传文件错误:', error);
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.post('/:id/process-ai', authMiddleware, async (req, res) => {
  try {
    const content = Content.findById(req.user.id, parseInt(req.params.id));
    
    if (!content) {
      return res.status(404).json({
        success: false,
        error: '内容不存在'
      });
    }
    
    if (!req.user.deepseekApiKey) {
      return res.status(400).json({
        success: false,
        error: '请先在设置页面配置 Deepseek API Key'
      });
    }
    
    const aiService = new AIService(req.user.deepseekApiKey);
    const aiResult = await aiService.processContent({
      title: content.title,
      raw_content: content.raw_content,
      extracted_text: content.extracted_text,
      content_type: content.content_type,
      tags: content.tags
    });
    
    const updatedContent = Content.update(req.user.id, content.id, aiResult);
    
    res.json({
      success: true,
      data: updatedContent,
      message: 'AI 处理完成'
    });
  } catch (error) {
    console.error('AI 处理错误:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.post('/:id/ocr', authMiddleware, async (req, res) => {
  try {
    const content = Content.findById(req.user.id, parseInt(req.params.id));
    
    if (!content) {
      return res.status(404).json({
        success: false,
        error: '内容不存在'
      });
    }
    
    if (content.content_type !== 'image') {
      return res.status(400).json({
        success: false,
        error: '只有图片类型的内容可以进行 OCR 识别'
      });
    }
    
    if (!content.file_path || !fs.existsSync(content.file_path)) {
      return res.status(400).json({
        success: false,
        error: '图片文件不存在'
      });
    }
    
    const ocrText = await ocrService.recognizeImage(content.file_path);
    
    const updatedContent = Content.update(req.user.id, content.id, {
      extracted_text: ocrText,
      raw_content: ocrText
    });
    
    res.json({
      success: true,
      data: updatedContent,
      message: 'OCR 识别完成'
    });
  } catch (error) {
    console.error('OCR 处理错误:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { title, summary, tags, url } = req.body;
    
    const content = Content.findById(req.user.id, parseInt(req.params.id));
    if (!content) {
      return res.status(404).json({
        success: false,
        error: '内容不存在'
      });
    }
    
    const updates = {};
    if (title !== undefined) updates.title = title;
    if (summary !== undefined) updates.summary = summary;
    if (tags !== undefined) updates.tags = tags;
    if (url !== undefined) updates.url = url;
    
    const updatedContent = Content.update(req.user.id, content.id, updates);
    
    res.json({
      success: true,
      data: updatedContent,
      message: '已更新'
    });
  } catch (error) {
    console.error('更新内容错误:', error);
    res.status(500).json({
      success: false,
      error: '服务器错误'
    });
  }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const content = Content.findById(req.user.id, parseInt(req.params.id));
    if (!content) {
      return res.status(404).json({
        success: false,
        error: '内容不存在'
      });
    }
    
    if (content.file_path && fs.existsSync(content.file_path)) {
      fs.unlinkSync(content.file_path);
    }
    
    const deleted = Content.delete(req.user.id, content.id);
    
    res.json({
      success: deleted,
      message: deleted ? '已删除' : '删除失败'
    });
  } catch (error) {
    console.error('删除内容错误:', error);
    res.status(500).json({
      success: false,
      error: '服务器错误'
    });
  }
});

module.exports = router;
