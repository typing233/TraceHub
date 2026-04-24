const Tesseract = require('tesseract.js');
const path = require('path');
const fs = require('fs');

class OCRService {
  constructor() {
    this.worker = null;
    this.isInitialized = false;
  }

  async initWorker(language = 'chi_sim+eng') {
    if (this.worker && this.isInitialized) {
      return this.worker;
    }

    this.worker = await Tesseract.createWorker(language, 1, {
      logger: (m) => {
        if (m.status === 'recognizing text') {
          console.log(`OCR 进度: ${Math.round(m.progress * 100)}%`);
        }
      }
    });

    this.isInitialized = true;
    return this.worker;
  }

  async recognizeImage(imagePath, options = {}) {
    const { language = 'chi_sim+eng', format = 'text' } = options;

    if (!fs.existsSync(imagePath)) {
      throw new Error('图片文件不存在');
    }

    const worker = await this.initWorker(language);
    
    try {
      const { data } = await worker.recognize(imagePath);
      
      if (format === 'full') {
        return {
          text: data.text,
          words: data.words,
          lines: data.lines,
          paragraphs: data.paragraphs,
          confidence: data.confidence
        };
      }

      return data.text;
    } catch (error) {
      console.error('OCR 识别失败:', error);
      throw new Error('OCR 识别失败: ' + error.message);
    }
  }

  async recognizeBuffer(buffer, options = {}) {
    const { language = 'chi_sim+eng', format = 'text' } = options;

    const worker = await this.initWorker(language);
    
    try {
      const { data } = await worker.recognize(buffer);
      
      if (format === 'full') {
        return {
          text: data.text,
          words: data.words,
          lines: data.lines,
          paragraphs: data.paragraphs,
          confidence: data.confidence
        };
      }

      return data.text;
    } catch (error) {
      console.error('OCR 识别失败:', error);
      throw new Error('OCR 识别失败: ' + error.message);
    }
  }

  async terminate() {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
      this.isInitialized = false;
    }
  }
}

const ocrService = new OCRService();

module.exports = ocrService;
