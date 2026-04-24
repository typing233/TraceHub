const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, '..', 'data', 'tracehub.db');
const backupPath = path.join(__dirname, '..', 'data', `tracehub-backup-${Date.now()}.db`);

console.log('========================================');
console.log('  修复 FTS5 数据库');
console.log('========================================\n');

try {
  if (fs.existsSync(dbPath)) {
    console.log('备份数据库...');
    fs.copyFileSync(dbPath, backupPath);
    console.log(`✅ 数据库已备份到: ${backupPath}\n`);
  }

  console.log('连接数据库...');
  const db = new Database(dbPath);
  console.log('✅ 数据库连接成功\n');

  console.log('--- 1. 备份 contents 表数据 ---');
  const contents = db.prepare(`
    SELECT id, user_id, title, content_type, url, raw_content, 
           extracted_text, summary, tags, file_path, created_at, updated_at
    FROM contents
    ORDER BY id
  `).all();
  
  console.log(`✅ 从 contents 表备份了 ${contents.length} 条记录\n`);

  console.log('--- 2. 删除损坏的 FTS 表 ---');
  try {
    db.exec('DROP TABLE IF EXISTS contents_fts');
    console.log('✅ 已删除 contents_fts 表');
  } catch (e) {
    console.log('⚠️ 删除 contents_fts 表时出错 (可能已损坏):', e.message);
  }

  try {
    db.exec('DROP TABLE IF EXISTS contents_fts_config');
    db.exec('DROP TABLE IF EXISTS contents_fts_data');
    db.exec('DROP TABLE IF EXISTS contents_fts_docsize');
    db.exec('DROP TABLE IF EXISTS contents_fts_idx');
    console.log('✅ 已删除 FTS 辅助表\n');
  } catch (e) {
    console.log('⚠️ 删除 FTS 辅助表时出错:', e.message, '\n');
  }

  console.log('--- 3. 重新创建 FTS 表 ---');
  db.exec(`
    CREATE VIRTUAL TABLE contents_fts USING fts5(
      title,
      extracted_text,
      summary,
      tags
    );
  `);
  console.log('✅ FTS 表创建成功\n');

  console.log('--- 4. 重建 FTS 索引 ---');
  let successCount = 0;
  let failCount = 0;

  for (const content of contents) {
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
      successCount++;
    } catch (e) {
      console.log(`⚠️ 重建内容 id ${content.id} 的 FTS 索引失败:`, e.message);
      failCount++;
    }
  }

  console.log(`\n✅ FTS 索引重建完成: ${successCount} 条成功, ${failCount} 条失败\n`);

  console.log('--- 5. 验证修复结果 ---');
  const testTerms = ['Example', '测试', 'Denoising', 'Diffusion'];
  
  testTerms.forEach(term => {
    try {
      const ftsResults = db.prepare(`
        SELECT rowid, title
        FROM contents_fts 
        WHERE contents_fts MATCH ?
      `).all(term);
      
      console.log(`搜索 "${term}": ${ftsResults.length} 条结果`);
      ftsResults.forEach(r => {
        console.log(`  - rowid: ${r.rowid}, title: ${r.title}`);
      });
    } catch (e) {
      console.log(`搜索 "${term}" 失败:`, e.message);
    }
  });

  db.close();
  
  console.log('\n========================================');
  console.log('  修复完成');
  console.log('========================================');
  console.log('✅ 数据库备份:', backupPath);
  console.log('✅ FTS 表已重建');
  console.log('========================================\n');

} catch (error) {
  console.error('\n❌ 修复过程出错:', error.message);
  console.error(error.stack);
  
  if (fs.existsSync(backupPath)) {
    console.log('\n💡 可以从备份恢复数据库:', backupPath);
  }
}
