const http = require('http');
const https = require('https');

const TEST_CONFIG = {
  baseUrl: 'http://localhost:2263',
  testUsername: 'tst' + Date.now().toString().slice(-8),
  testPassword: 'testpass123',
  testApiKey: 'sk-deepseek-test-key'
};

let authToken = null;
let testContentId = null;
let testFeedId = null;
let testRuleId = null;

const results = {
  passed: 0,
  failed: 0,
  tests: []
};

function logTest(name, passed, message = '') {
  const status = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`  ${status}: ${name}`);
  if (message) console.log(`    ${message}`);
  if (passed) results.passed++;
  else results.failed++;
  results.tests.push({ name, passed, message });
}

function httpRequest(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(TEST_CONFIG.baseUrl + path);
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    if (authToken) {
      options.headers['Authorization'] = `Bearer ${authToken}`;
    }

    const httpModule = url.protocol === 'https:' ? https : http;
    const req = httpModule.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        let responseData = data;
        try {
          responseData = JSON.parse(data);
        } catch (e) {}
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: responseData
        });
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('\n========================================');
  console.log('  TraceHub API 测试套件');
  console.log('========================================\n');

  console.log('测试配置:');
  console.log(`  服务地址: ${TEST_CONFIG.baseUrl}`);
  console.log(`  测试用户: ${TEST_CONFIG.testUsername}`);
  console.log();

  try {
    console.log('--- 健康检查 ---');
    const healthRes = await httpRequest('GET', '/');
    logTest('服务健康检查', healthRes.statusCode === 200, `状态码: ${healthRes.statusCode}`);

    console.log('\n--- 认证测试 ---');
    
    const registerRes = await httpRequest('POST', '/api/auth/register', {
      username: TEST_CONFIG.testUsername,
      password: TEST_CONFIG.testPassword
    });
    logTest('用户注册', registerRes.statusCode === 200 || registerRes.statusCode === 201, 
      `状态码: ${registerRes.statusCode}`);

    const loginRes = await httpRequest('POST', '/api/auth/login', {
      username: TEST_CONFIG.testUsername,
      password: TEST_CONFIG.testPassword
    });
    logTest('用户登录', loginRes.statusCode === 200 && loginRes.data?.data?.sessionToken,
      `状态码: ${loginRes.statusCode}, 有Token: ${!!loginRes.data?.data?.sessionToken}`);
    
    if (loginRes.data?.data?.sessionToken) {
      authToken = loginRes.data.data.sessionToken;
    }

    const badLoginRes = await httpRequest('POST', '/api/auth/login', {
      username: TEST_CONFIG.testUsername,
      password: 'wrongpassword'
    });
    logTest('错误密码登录失败', badLoginRes.statusCode === 401,
      `状态码: ${badLoginRes.statusCode}`);

    const meRes = await httpRequest('GET', '/api/auth/me');
    logTest('获取当前用户信息', meRes.statusCode === 200 && meRes.data?.data?.user?.id,
      `状态码: ${meRes.statusCode}, 用户名: ${meRes.data?.data?.user?.username}`);

    console.log('\n--- 内容管理测试 ---');

    const textContentRes = await httpRequest('POST', '/api/contents/text', {
      title: '测试文本内容',
      text: '这是一段用于测试的文本内容，包含中文和English。这是测试全文检索功能的内容。',
      source: '测试'
    });
    logTest('保存文本内容', textContentRes.statusCode === 200 && textContentRes.data?.data?.id,
      `状态码: ${textContentRes.statusCode}, 内容ID: ${textContentRes.data?.data?.id}`);
    
    if (textContentRes.data?.data?.id) {
      testContentId = textContentRes.data.data.id;
    }

    const urlContentRes = await httpRequest('POST', '/api/contents/url', {
      url: 'https://example.com'
    });
    logTest('保存网页URL', urlContentRes.statusCode === 200,
      `状态码: ${urlContentRes.statusCode}`);

    const listRes = await httpRequest('GET', '/api/contents?limit=10&offset=0');
    logTest('获取内容列表', listRes.statusCode === 200 && Array.isArray(listRes.data?.data?.contents),
      `状态码: ${listRes.statusCode}, 数量: ${Array.isArray(listRes.data?.data?.contents) ? listRes.data.data.contents.length : 0}`);

    if (testContentId) {
      const detailRes = await httpRequest('GET', `/api/contents/${testContentId}`);
      logTest('获取内容详情', detailRes.statusCode === 200 && detailRes.data?.data?.id === testContentId,
        `状态码: ${detailRes.statusCode}, ID匹配: ${detailRes.data?.data?.id === testContentId}`);
    }

    if (testContentId) {
      const updateRes = await httpRequest('PUT', `/api/contents/${testContentId}`, {
        title: '更新后的测试标题',
        summary: '更新后的摘要'
      });
      logTest('更新内容', updateRes.statusCode === 200,
        `状态码: ${updateRes.statusCode}`);
    }

    const statsRes = await httpRequest('GET', '/api/contents/stats');
    logTest('获取统计数据', statsRes.statusCode === 200 && statsRes.data?.success,
      `状态码: ${statsRes.statusCode}`);

    console.log('\n--- 全文检索测试 ---');

    const searchRes = await httpRequest('GET', '/api/contents/search?q=测试');
    logTest('全文检索', searchRes.statusCode === 200 && Array.isArray(searchRes.data?.data?.results),
      `状态码: ${searchRes.statusCode}, 结果数: ${Array.isArray(searchRes.data?.data?.results) ? searchRes.data.data.results.length : 0}`);

    const shortSearchRes = await httpRequest('GET', '/api/contents/search?q=a');
    logTest('短搜索词返回错误', shortSearchRes.statusCode === 400,
      `状态码: ${shortSearchRes.statusCode} (应返回 400)`);

    console.log('\n--- RSS 订阅测试 ---');

    const rssListRes = await httpRequest('GET', '/api/rss');
    logTest('获取RSS订阅源列表', rssListRes.statusCode === 200 && Array.isArray(rssListRes.data?.data),
      `状态码: ${rssListRes.statusCode}`);

    console.log('\n--- 规则引擎测试 ---');

    const ruleTypesRes = await httpRequest('GET', '/api/rules/types');
    logTest('获取规则类型', ruleTypesRes.statusCode === 200 && 
      Array.isArray(ruleTypesRes.data?.data?.conditionTypes) && 
      Array.isArray(ruleTypesRes.data?.data?.actionTypes),
      `状态码: ${ruleTypesRes.statusCode}`);

    const createRuleRes = await httpRequest('POST', '/api/rules', {
      name: '测试规则',
      condition_type: 'title_contains',
      condition_value: '测试',
      action_type: 'add_tag',
      action_value: '测试标签',
      is_active: 1
    });
    logTest('创建规则', createRuleRes.statusCode === 200 && createRuleRes.data?.data?.id,
      `状态码: ${createRuleRes.statusCode}, ruleId: ${createRuleRes.data?.data?.id}`);
    
    if (createRuleRes.data?.data?.id) {
      testRuleId = createRuleRes.data.data.id;
    }

    const listRulesRes = await httpRequest('GET', '/api/rules');
    logTest('获取规则列表', listRulesRes.statusCode === 200 && Array.isArray(listRulesRes.data?.data),
      `状态码: ${listRulesRes.statusCode}, 规则数: ${Array.isArray(listRulesRes.data?.data) ? listRulesRes.data.data.length : 0}`);

    console.log('\n--- API Key 配置测试 ---');

    const updateApiKeyRes = await httpRequest('PUT', '/api/auth/api-key', {
      apiKey: TEST_CONFIG.testApiKey
    });
    logTest('更新API Key', updateApiKeyRes.statusCode === 200,
      `状态码: ${updateApiKeyRes.statusCode}`);

    console.log('\n--- 清理测试数据 ---');

    if (testRuleId) {
      const deleteRuleRes = await httpRequest('DELETE', `/api/rules/${testRuleId}`);
      logTest('删除测试规则', deleteRuleRes.statusCode === 200 || deleteRuleRes.statusCode === 204,
        `状态码: ${deleteRuleRes.statusCode}`);
    }

    if (testContentId) {
      const deleteContentRes = await httpRequest('DELETE', `/api/contents/${testContentId}`);
      logTest('删除测试内容', deleteContentRes.statusCode === 200 || deleteContentRes.statusCode === 204,
        `状态码: ${deleteContentRes.statusCode}`);
    }

    const logoutRes = await httpRequest('POST', '/api/auth/logout');
    logTest('退出登录', logoutRes.statusCode === 200,
      `状态码: ${logoutRes.statusCode}`);

  } catch (error) {
    console.error('\n测试执行出错:', error.message);
    results.failed++;
    results.tests.push({ name: '测试执行异常', passed: false, message: error.message });
  }

  console.log('\n========================================');
  console.log('  测试结果汇总');
  console.log('========================================');
  console.log(`  总测试数: ${results.passed + results.failed}`);
  console.log(`  ✅ 通过: ${results.passed}`);
  console.log(`  ❌ 失败: ${results.failed}`);
  console.log(`  通过率: ${((results.passed / (results.passed + results.failed)) * 100).toFixed(1)}%`);
  console.log('========================================\n');

  return results.failed === 0;
}

runTests().then((allPassed) => {
  process.exit(allPassed ? 0 : 1);
}).catch((err) => {
  console.error('测试运行失败:', err);
  process.exit(1);
});
