const axios = require('axios');
const cheerio = require('cheerio');
const pdfParse = require('pdf-parse');
const fs = require('fs');
const path = require('path');

class ContentExtractor {
  async extractFromUrl(url, options = {}) {
    const { fullContent = false } = options;
    
    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        },
        timeout: 30000,
        maxRedirects: 5
      });

      const contentType = response.headers['content-type'] || '';
      
      if (contentType.includes('application/pdf') || url.endsWith('.pdf')) {
        return this.extractFromPdfBuffer(response.data, url);
      }

      return this.extractFromHtml(response.data, url, fullContent);
    } catch (error) {
      console.error('从 URL 提取内容失败:', error.message);
      throw new Error(`无法获取网页内容: ${error.message}`);
    }
  }

  extractFromHtml(html, url, fullContent = false) {
    const $ = cheerio.load(html);
    
    const title = $('title').text().trim() || 
                  $('h1').first().text().trim() ||
                  '未命名网页';
    
    let content = '';
    
    if (fullContent) {
      $('script, style, noscript, iframe, nav, header, footer, aside').remove();
      content = $('body').text().replace(/\s+/g, ' ').trim();
    } else {
      const articleSelectors = [
        'article',
        '[role="main"]',
        '.content',
        '.article',
        '.post',
        '.entry-content',
        'main'
      ];
      
      let mainContent = null;
      for (const selector of articleSelectors) {
        const el = $(selector);
        if (el.length > 0 && el.text().trim().length > 100) {
          mainContent = el;
          break;
        }
      }
      
      if (mainContent) {
        mainContent.find('script, style, noscript').remove();
        content = mainContent.text().replace(/\s+/g, ' ').trim();
      } else {
        $('script, style, noscript, nav, header, footer').remove();
        content = $('body').text().replace(/\s+/g, ' ').trim();
      }
    }
    
    const metaDescription = $('meta[name="description"]').attr('content') ||
                           $('meta[property="og:description"]').attr('content') || '';
    
    const images = [];
    $('img').each((_, img) => {
      const src = $(img).attr('src');
      if (src && !src.startsWith('data:')) {
        try {
          const absoluteUrl = new URL(src, url).href;
          images.push(absoluteUrl);
        } catch {}
      }
    });

    return {
      title,
      content,
      metaDescription,
      url,
      images: images.slice(0, 10),
      content_type: 'webpage',
      raw_content: fullContent ? html : null
    };
  }

  async extractFromPdfBuffer(buffer, sourceUrl = null) {
    try {
      const data = await pdfParse(buffer);
      
      return {
        title: data.info?.Title || 'PDF 文档',
        content: data.text,
        metaDescription: `PDF 文档，共 ${data.numpages} 页`,
        url: sourceUrl,
        images: [],
        content_type: 'pdf',
        raw_content: data.text,
        metadata: {
          author: data.info?.Author,
          subject: data.info?.Subject,
          keywords: data.info?.Keywords,
          pageCount: data.numpages
        }
      };
    } catch (error) {
      console.error('解析 PDF 失败:', error.message);
      throw new Error(`无法解析 PDF 文档: ${error.message}`);
    }
  }

  async extractFromPdfFile(filePath) {
    const buffer = fs.readFileSync(filePath);
    return this.extractFromPdfBuffer(buffer, filePath);
  }

  async extractFromText(text, title = null) {
    return {
      title: title || this.extractTitleFromText(text),
      content: text,
      metaDescription: text.substring(0, 200),
      url: null,
      images: [],
      content_type: 'text',
      raw_content: text
    };
  }

  extractTitleFromText(text) {
    const firstLine = text.split('\n')[0]?.trim();
    if (firstLine && firstLine.length < 100) {
      return firstLine;
    }
    return '文本内容';
  }

  cleanContent(content) {
    if (!content) return '';
    
    return content
      .replace(/\n\s*\n\s*\n/g, '\n\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/^\s+|\s+$/g, '')
      .substring(0, 50000);
  }
}

module.exports = new ContentExtractor();
