const axios = require('axios');

class AIService {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.deepseek.com/v1';
    this.model = 'deepseek-chat';
  }

  async chat(messages, options = {}) {
    if (!this.apiKey) {
      throw new Error('Deepseek API Key 未配置，请在设置页面配置后再使用 AI 功能');
    }

    try {
      const response = await axios.post(
        `${this.baseUrl}/chat/completions`,
        {
          model: this.model,
          messages: messages,
          temperature: options.temperature || 0.7,
          max_tokens: options.max_tokens || 2000,
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 60000,
        }
      );

      return response.data.choices[0].message.content;
    } catch (error) {
      console.error('AI 服务错误:', error.response?.data || error.message);
      if (error.response?.data?.error) {
        throw new Error(`Deepseek API 错误: ${error.response.data.error.message}`);
      }
      throw new Error('AI 服务调用失败，请稍后重试');
    }
  }

  async generateSummary(content, contentType = 'text') {
    const contentToSummarize = content.substring(0, 8000);
    
    const systemPrompt = `你是一个专业的内容摘要生成助手。请根据用户提供的内容，生成一个简洁、准确的摘要。
要求：
1. 摘要应包含内容的核心要点
2. 长度控制在 100-300 字之间
3. 使用中文
4. 保持客观中立`;

    const userPrompt = `请为以下${this.getContentTypeLabel(contentType)}生成摘要：

${contentToSummarize}`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];

    return this.chat(messages, { temperature: 0.5, max_tokens: 500 });
  }

  async generateTags(content, contentType = 'text', existingTags = []) {
    const contentToAnalyze = content.substring(0, 8000);
    const existingTagsStr = existingTags.length > 0 ? `现有标签: ${existingTags.join(', ')}` : '';
    
    const systemPrompt = `你是一个专业的内容标签生成助手。请根据用户提供的内容，生成相关的标签。
要求：
1. 生成 3-8 个标签
2. 标签应准确反映内容主题
3. 标签要简洁，通常为 2-4 个字
4. 使用中文
5. 如果提供了现有标签，可适当补充但不要重复
6. 以逗号分隔的形式返回标签，不要有其他内容`;

    const userPrompt = `请为以下${this.getContentTypeLabel(contentType)}生成标签。
${existingTagsStr}

内容：
${contentToAnalyze}`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];

    const result = await this.chat(messages, { temperature: 0.6, max_tokens: 200 });
    const tags = result.split(/[,，\s]+/).filter(tag => tag.trim().length > 0);
    
    const combinedTags = [...new Set([...existingTags, ...tags])];
    return combinedTags.slice(0, 10);
  }

  async analyzeContent(content, contentType = 'text') {
    const contentToAnalyze = content.substring(0, 8000);
    
    const systemPrompt = `你是一个专业的内容分析助手。请分析用户提供的内容，返回一个 JSON 对象，包含以下字段：
- title: 建议的标题（简短概括）
- category: 内容分类（如：技术、新闻、学习、娱乐等）
- sentiment: 情感倾向（positive/neutral/negative）
- keywords: 关键词数组（3-5个）

请直接返回 JSON，不要有其他内容。`;

    const userPrompt = `请分析以下${this.getContentTypeLabel(contentType)}：

${contentToAnalyze}`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];

    const result = await this.chat(messages, { temperature: 0.5, max_tokens: 500 });
    
    try {
      return JSON.parse(result);
    } catch {
      return {
        title: this.extractFirstSentence(contentToAnalyze),
        category: '未分类',
        sentiment: 'neutral',
        keywords: []
      };
    }
  }

  async processContent(contentData) {
    const { title, raw_content, extracted_text, content_type, tags } = contentData;
    
    const textToProcess = extracted_text || raw_content || title || '';
    
    if (!textToProcess || textToProcess.trim().length < 10) {
      return {
        summary: '内容太短，无法生成摘要',
        tags: tags || ''
      };
    }

    try {
      const [summary, generatedTags] = await Promise.all([
        this.generateSummary(textToProcess, content_type),
        this.generateTags(textToProcess, content_type, tags ? tags.split(',').map(t => t.trim()) : [])
      ]);

      return {
        summary,
        tags: generatedTags.join(', ')
      };
    } catch (error) {
      console.error('AI 处理内容失败:', error);
      return {
        summary: `AI 处理失败: ${error.message}`,
        tags: tags || ''
      };
    }
  }

  getContentTypeLabel(type) {
    const labels = {
      'webpage': '网页',
      'text': '文本',
      'image': '图片',
      'pdf': 'PDF文档',
      'video': '视频',
      'rss': 'RSS文章'
    };
    return labels[type] || '内容';
  }

  extractFirstSentence(text) {
    if (!text) return '未知标题';
    const match = text.match(/^[^\n。！？.!?]+[。！？.!?]?/);
    return match ? match[0].substring(0, 50) : text.substring(0, 50);
  }
}

module.exports = AIService;
