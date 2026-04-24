const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'tracehub.db');
const db = new Database(dbPath);

console.log('========================================');
console.log('  FTS5 详细诊断');
console.log('========================================\n');

try {
  console.log('--- 1. 检查用户表 ---');
  const users = db.prepare('SELECT id, username, created_at FROM users').all();
  console.log('用户列表:');
  users.forEach(u => {
    console.log(`  - id: ${u.id}, username: ${u.username}`);
  });
  console.log();

  console.log('--- 2. 检查 PDF 内容详情 ---');
  const pdfContent = db.prepare(`
    SELECT id, user_id, title, content_type, 
           substr(extracted_text, 1, 500) as text_preview,
           length(extracted_text) as text_length
    FROM contents 
    WHERE content_type = 'pdf'
    ORDER BY created_at DESC
  `).all();
  
  console.log(`找到 ${pdfContent.length} 个 PDF 内容:\n`);
  pdfContent.forEach((pdf, index) => {
    console.log(`  [${index + 1}] id: ${pdf.id}, user_id: ${pdf.user_id}`);
    console.log(`      title: ${pdf.title}`);
    console.log(`      text_length: ${pdf.text_length} 字符`);
    console.log(`      文本预览: ${pdf.text_preview?.replace(/\s+/g, ' ').substring(0, 200)}...`);
    console.log();
  });

  console.log('--- 3. 检查 FTS5 配置 ---');
  try {
    const ftsConfig = db.prepare('SELECT * FROM contents_fts_config').all();
    console.log('FTS5 配置:');
    ftsConfig.forEach(c => console.log(`  - ${c.key}: ${c.value}`));
  } catch (e) {
    console.log('无法读取 FTS5 配置:', e.message);
  }
  console.log();

  console.log('--- 4. 直接测试 FTS5 搜索 ---');
  if (pdfContent.length > 0) {
    const firstPdf = pdfContent[0];
    
    const testTerms = [
      'Denoising',
      'Diffusion',
      'Models',
      'Jonathan',
      'Berkeley'
    ];
    
    console.log(`使用 PDF id: ${firstPdf.id} 进行测试\n`);
    
    testTerms.forEach(term => {
      try {
        const results = db.prepare(`
          SELECT rowid, title, substr(extracted_text, 1, 50) as preview
          FROM contents_fts 
          WHERE contents_fts MATCH ?
        `).all(term);
        
        console.log(`搜索 "${term}": ${results.length} 条结果`);
        if (results.length > 0) {
          results.forEach(r => {
            console.log(`  - rowid: ${r.rowid}, title: ${r.title}`);
          });
        }
      } catch (e) {
        console.log(`搜索 "${term}" 失败: ${e.message}`);
      }
    });
    console.log();

    console.log('--- 5. 测试 LIKE 查询（作为对比）---');
    testTerms.forEach(term => {
      const results = db.prepare(`
        SELECT id, title, substr(extracted_text, 1, 50) as preview
        FROM contents 
        WHERE extracted_text LIKE ?
      `).all(`%${term}%`);
      
      console.log(`LIKE 查询 "${term}": ${results.length} 条结果`);
      if (results.length > 0) {
        results.forEach(r => {
          console.log(`  - id: ${r.id}, title: ${r.title}`);
        });
      }
    });
  }
  console.log();

  console.log('--- 6. 检查 FTS5 分词 ---');
  if (pdfContent.length > 0) {
    const firstPdf = pdfContent[0];
    
    try {
      const ftsData = db.prepare(`
        SELECT rowid, extracted_text
        FROM contents_fts 
        WHERE rowid = ?
      `).get(firstPdf.id);
      
      if (ftsData) {
        console.log(`FTS 表中 rowid ${firstPdf.id} 的文本长度: ${ftsData.extracted_text?.length || 0}`);
        
        const first100Chars = ftsData.extracted_text?.substring(0, 100) || '';
        console.log(`FTS 表中文本前 100 字符:`);
        console.log(`  "${first100Chars.replace(/\n/g, '\\n')}"`);
        console.log();
        
        console.log('检查是否包含 "Denoising":');
        if (ftsData.extracted_text?.includes('Denoising')) {
          console.log('  ✅ 包含 "Denoising"');
        } else {
          console.log('  ❌ 不包含 "Denoising"');
        }
      } else {
        console.log('❌ FTS 表中没有找到 rowid', firstPdf.id);
      }
    } catch (e) {
      console.log('检查 FTS 数据失败:', e.message);
    }
  }
  console.log();

  console.log('--- 7. 重建 FTS 索引测试 ---');
  console.log('尝试重建 FTS 索引...\n');
  
  try {
    const allContents = db.prepare(`
      SELECT id, title, extracted_text, summary, tags
      FROM contents
      ORDER BY id
    `).all();
    
    console.log(`将重建 ${allContents.length} 条内容的 FTS 索引\n`);
    
    allContents.forEach(content => {
      const existing = db.prepare('SELECT rowid FROM contents_fts WHERE rowid = ?').get(content.id);
      
      if (existing) {
        db.prepare(`
          UPDATE contents_fts 
          SET title = ?, extracted_text = ?, summary = ?, tags = ?
          WHERE rowid = ?
        `).run(
          content.title || '', 
          content.extracted_text || '', 
          content.summary || '', 
          content.tags || '',
          content.id
        );
      } else {
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
      }
    });
    
    console.log('✅ FTS 索引重建完成\n');
    
    console.log('--- 8. 重建后测试搜索 ---');
    if (pdfContent.length > 0) {
      const testTerms = ['Denoising', 'Diffusion', 'Models'];
      
      testTerms.forEach(term => {
        const results = db.prepare(`
          SELECT rowid, title
          FROM contents_fts 
          WHERE contents_fts MATCH ?
        `).all(term);
        
        console.log(`搜索 "${term}": ${results.length} 条结果`);
        if (results.length > 0) {
          results.forEach(r => {
            console.log(`  - rowid: ${r.rowid}, title: ${r.title}`);
          });
        }
      });
    }
  } catch (e) {
    console.log('❌ 重建 FTS 索引失败:', e.message);
    console.log(e.stack);
  }

  console.log('\n========================================');
  console.log('  诊断完成');
  console.log('========================================\n');

} catch (error) {
  console.error('诊断过程出错:', error.message);
  console.error(error.stack);
} finally {
  db.close();
}
