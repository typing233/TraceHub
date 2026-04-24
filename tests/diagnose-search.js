const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'tracehub.db');
const db = new Database(dbPath);

console.log('========================================');
console.log('  TraceHub 全文检索诊断');
console.log('========================================\n');

try {
  console.log('--- 1. 检查数据库表 ---');
  const tables = db.prepare(`
    SELECT name FROM sqlite_master WHERE type='table' ORDER BY name
  `).all();
  console.log('数据库表:');
  tables.forEach(t => console.log(`  - ${t.name}`));
  console.log();

  console.log('--- 2. 检查 FTS 表 ---');
  const ftsTable = db.prepare(`
    SELECT name FROM sqlite_master WHERE type='table' AND name='contents_fts'
  `).get();
  
  if (ftsTable) {
    console.log('✅ FTS 表存在\n');
    
    console.log('--- 3. 检查 FTS 表数据 ---');
    const ftsData = db.prepare(`
      SELECT rowid, title, length(extracted_text) as text_length, substr(extracted_text, 1, 100) as preview
      FROM contents_fts
      LIMIT 10
    `).all();
    
    console.log(`FTS 表中有 ${ftsData.length} 条记录:\n`);
    ftsData.forEach((item, index) => {
      console.log(`  [${index + 1}] rowid: ${item.rowid}`);
      console.log(`      title: ${item.title || '(空)'}`);
      console.log(`      text_length: ${item.text_length || 0} 字符`);
      console.log(`      preview: ${(item.preview || '(空)').replace(/\n/g, ' ')}...`);
      console.log();
    });
  } else {
    console.log('❌ FTS 表不存在!\n');
  }

  console.log('--- 4. 检查 contents 表数据 ---');
  const contents = db.prepare(`
    SELECT id, user_id, title, content_type, 
           length(extracted_text) as text_length,
           substr(extracted_text, 1, 100) as preview,
           created_at
    FROM contents
    ORDER BY created_at DESC
    LIMIT 10
  `).all();
  
  console.log(`contents 表中有 ${contents.length} 条记录:\n`);
  contents.forEach((item, index) => {
    console.log(`  [${index + 1}] id: ${item.id}, user_id: ${item.user_id}`);
    console.log(`      title: ${item.title || '(空)'}`);
    console.log(`      type: ${item.content_type}`);
    console.log(`      text_length: ${item.text_length || 0} 字符`);
    console.log(`      preview: ${(item.preview || '(空)').replace(/\n/g, ' ').substring(0, 80)}...`);
    console.log(`      created_at: ${item.created_at}`);
    console.log();
  });

  console.log('--- 5. 检查数据一致性 ---');
  const contentIds = db.prepare('SELECT id FROM contents').pluck().all();
  const ftsIds = db.prepare('SELECT rowid FROM contents_fts').pluck().all();
  
  const missingInFTS = contentIds.filter(id => !ftsIds.includes(id));
  const extraInFTS = ftsIds.filter(id => !contentIds.includes(id));
  
  console.log(`contents 表 ID: ${contentIds.join(', ') || '(空)'}`);
  console.log(`FTS 表 ID: ${ftsIds.join(', ') || '(空)'}`);
  console.log();
  
  if (missingInFTS.length > 0) {
    console.log(`❌ 以下内容缺少 FTS 索引: ${missingInFTS.join(', ')}`);
  } else {
    console.log('✅ 所有内容都有 FTS 索引');
  }
  
  if (extraInFTS.length > 0) {
    console.log(`❌ FTS 表中有多余的索引: ${extraInFTS.join(', ')}`);
  }
  console.log();

  console.log('--- 6. 测试 FTS 搜索 ---');
  if (contents.length > 0) {
    const firstContent = contents[0];
    const testText = firstContent.preview || firstContent.title || '';
    const testWords = testText.split(/\s+/).filter(w => w.length >= 2).slice(0, 3);
    
    if (testWords.length > 0) {
      const testWord = testWords[0];
      console.log(`使用测试词: "${testWord}"\n`);
      
      try {
        const ftsResults = db.prepare(`
          SELECT rowid, title, substr(extracted_text, 1, 50) as preview
          FROM contents_fts 
          WHERE contents_fts MATCH ?
        `).all(testWord);
        
        console.log(`FTS 搜索 "${testWord}" 找到 ${ftsResults.length} 条结果:`);
        ftsResults.forEach((r, i) => {
          console.log(`  [${i + 1}] rowid: ${r.rowid}, title: ${r.title || '(空)'}`);
        });
      } catch (e) {
        console.log(`❌ FTS 搜索失败: ${e.message}`);
        
        try {
          console.log('\n尝试使用 LIKE 查询:');
          const likeResults = db.prepare(`
            SELECT id, title, substr(extracted_text, 1, 50) as preview
            FROM contents 
            WHERE title LIKE ? OR extracted_text LIKE ?
          `).all(`%${testWord}%`, `%${testWord}%`);
          
          console.log(`LIKE 查询 "${testWord}" 找到 ${likeResults.length} 条结果:`);
          likeResults.forEach((r, i) => {
            console.log(`  [${i + 1}] id: ${r.id}, title: ${r.title || '(空)'}`);
          });
        } catch (likeErr) {
          console.log(`LIKE 查询也失败: ${likeErr.message}`);
        }
      }
    } else {
      console.log('没有合适的测试词');
    }
  } else {
    console.log('没有内容可测试');
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
