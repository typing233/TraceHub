const API_BASE = '';
let sessionToken = localStorage.getItem('session_token');
let currentUser = null;

async function apiRequest(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };
  
  if (sessionToken) {
    headers['Authorization'] = `Bearer ${sessionToken}`;
  }

  const config = {
    method: options.method || 'GET',
    headers,
    credentials: 'include',
    ...options
  };

  if (options.body && typeof options.body !== 'string') {
    config.body = JSON.stringify(options.body);
  }

  const response = await fetch(url, config);
  const data = await response.json();

  if (!response.ok) {
    if (response.status === 401) {
      logout();
      throw new Error('登录已过期，请重新登录');
    }
    throw new Error(data.error || '请求失败');
  }

  return data;
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  
  const typeClasses = {
    success: 'alert-success',
    error: 'alert-danger',
    warning: 'alert-warning',
    info: 'alert-info'
  };
  
  toast.className = `toast ${typeClasses[type]}`;
  toast.textContent = message;
  
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatFileSize(bytes) {
  if (!bytes) return '-';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

function getContentIcon(type) {
  const icons = {
    webpage: '🌐',
    text: '📝',
    image: '🖼️',
    pdf: '📄',
    video: '🎥'
  };
  return icons[type] || '📁';
}

function getContentTypeName(type) {
  const names = {
    webpage: '网页',
    text: '文本',
    image: '图片',
    pdf: 'PDF',
    video: '视频'
  };
  return names[type] || type;
}

async function login(username, password) {
  const data = await apiRequest('/api/auth/login', {
    method: 'POST',
    body: { username, password }
  });
  
  sessionToken = data.data.sessionToken;
  localStorage.setItem('session_token', sessionToken);
  currentUser = data.data.user;
  
  showToast('登录成功', 'success');
  showMainPage();
  loadDashboard();
}

async function register(username, password) {
  const data = await apiRequest('/api/auth/register', {
    method: 'POST',
    body: { username, password }
  });
  
  sessionToken = data.data.sessionToken;
  localStorage.setItem('session_token', sessionToken);
  currentUser = data.data.user;
  
  showToast('注册成功', 'success');
  showMainPage();
  loadDashboard();
}

async function logout() {
  try {
    await apiRequest('/api/auth/logout', { method: 'POST' });
  } catch (e) {}
  
  sessionToken = null;
  currentUser = null;
  localStorage.removeItem('session_token');
  
  showLoginPage();
  showToast('已退出登录', 'info');
}

async function checkAuth() {
  if (!sessionToken) {
    return false;
  }
  
  try {
    const data = await apiRequest('/api/auth/me');
    currentUser = data.data.user;
    return true;
  } catch (e) {
    sessionToken = null;
    localStorage.removeItem('session_token');
    return false;
  }
}

function showLoginPage() {
  document.getElementById('login-page').classList.add('active');
  document.getElementById('main-page').classList.remove('active');
}

function showMainPage() {
  document.getElementById('login-page').classList.remove('active');
  document.getElementById('main-page').classList.add('active');
  
  if (currentUser) {
    document.getElementById('user-name').textContent = currentUser.username;
    document.getElementById('user-avatar').textContent = currentUser.username[0].toUpperCase();
  }
}

function navigateTo(page) {
  document.querySelectorAll('.sidebar-nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.page === page);
  });
  
  document.querySelectorAll('.page-section').forEach(section => {
    section.classList.remove('active');
  });
  
  const section = document.getElementById(`${page}-section`);
  if (section) {
    section.classList.add('active');
  }
  
  loadPageData(page);
}

async function loadPageData(page) {
  switch (page) {
    case 'dashboard':
      await loadDashboard();
      break;
    case 'contents':
      await loadContents();
      break;
    case 'rss':
      await loadRSSFeeds();
      break;
    case 'rules':
      await loadRules();
      break;
    case 'settings':
      await loadSettings();
      break;
  }
}

async function loadDashboard() {
  try {
    const [contentsData, rssData] = await Promise.all([
      apiRequest('/api/contents/stats'),
      apiRequest('/api/rss')
    ]);
    
    const stats = contentsData.data;
    const feeds = rssData.data || [];
    
    document.getElementById('stat-total').textContent = stats.total || 0;
    document.getElementById('stat-recent').textContent = stats.recent || 0;
    document.getElementById('stat-feeds').textContent = feeds.length;
    
    const recentContents = await apiRequest('/api/contents?limit=5');
    renderRecentContents(recentContents.data.contents);
    
    renderRSSOverview(feeds);
  } catch (e) {
    console.error('加载仪表盘失败:', e);
  }
}

function renderRecentContents(contents) {
  const container = document.getElementById('recent-contents');
  
  if (!contents || contents.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📚</div>
        <div class="empty-state-title">暂无内容</div>
        <div class="empty-state-text">开始添加您的第一条内容吧</div>
      </div>
    `;
    return;
  }
  
  container.innerHTML = contents.map(content => `
    <div class="list-item" onclick="viewContent(${content.id})">
      <div class="content-type-badge content-type-${content.content_type}">
        ${getContentIcon(content.content_type)} ${getContentTypeName(content.content_type)}
      </div>
      <div class="list-item-content" style="margin-top: 0.5rem;">
        <div class="list-item-title">${content.title || '无标题'}</div>
        <div class="list-item-meta">
          <span>${formatDate(content.created_at)}</span>
          ${content.tags ? `<span>🏷️ ${content.tags.split(',').slice(0, 3).join(', ')}</span>` : ''}
        </div>
      </div>
    </div>
  `).join('');
}

function renderRSSOverview(feeds) {
  const container = document.getElementById('rss-overview');
  
  if (!feeds || feeds.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📰</div>
        <div class="empty-state-title">暂无订阅</div>
        <div class="empty-state-text">添加 RSS 订阅源自动获取资讯</div>
      </div>
    `;
    return;
  }
  
  const totalUnread = feeds.reduce((sum, feed) => sum + (feed.unreadCount || 0), 0);
  
  container.innerHTML = `
    <div style="margin-bottom: 1rem;">
      <div class="flex justify-between items-center mb-2">
        <span class="text-muted">未读文章</span>
        <span class="badge badge-warning">${totalUnread}</span>
      </div>
    </div>
    ${feeds.slice(0, 5).map(feed => `
      <div class="list-item">
        <div class="list-item-content">
          <div class="list-item-title">${feed.name}</div>
          <div class="list-item-meta">
            <span class="unread-badge">${feed.unreadCount || 0}</span>
            <span>未读</span>
          </div>
        </div>
      </div>
    `).join('')}
  `;
}

let currentFilter = '';

async function loadContents() {
  const params = new URLSearchParams();
  if (currentFilter) params.append('content_type', currentFilter);
  params.append('limit', '50');
  
  const data = await apiRequest(`/api/contents?${params}`);
  renderContents(data.data.contents);
}

function renderContents(contents) {
  const container = document.getElementById('contents-list');
  
  if (!contents || contents.length === 0) {
    container.innerHTML = `
      <div class="card">
        <div class="card-body">
          <div class="empty-state">
            <div class="empty-state-icon">📚</div>
            <div class="empty-state-title">内容库为空</div>
            <div class="empty-state-text">点击"添加内容"开始收集您的知识</div>
            <button class="btn btn-primary mt-4" onclick="navigateTo('add')">
              ➕ 添加内容
            </button>
          </div>
        </div>
      </div>
    `;
    return;
  }
  
  container.innerHTML = `
    <div class="card">
      ${contents.map(content => `
        <div class="list-item">
          <div class="content-type-badge content-type-${content.content_type}" style="flex-shrink: 0;">
            ${getContentIcon(content.content_type)}
          </div>
          <div class="list-item-content">
            <div class="list-item-title">${content.title || '无标题'}</div>
            ${content.summary ? `<div class="text-muted" style="font-size: 0.8rem; margin-top: 0.25rem;">${content.summary.substring(0, 150)}${content.summary.length > 150 ? '...' : ''}</div>` : ''}
            <div class="list-item-meta mt-2">
              <span>${getContentTypeName(content.content_type)}</span>
              <span>${formatDate(content.created_at)}</span>
              ${content.tags ? `<span>🏷️ ${content.tags.split(',').slice(0, 3).join(', ')}</span>` : ''}
            </div>
          </div>
          <div class="list-item-actions">
            <button class="btn btn-secondary btn-sm" onclick="viewContent(${content.id})">查看</button>
            <button class="btn btn-danger btn-sm" onclick="deleteContent(${content.id})">删除</button>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

async function viewContent(id) {
  try {
    const data = await apiRequest(`/api/contents/${id}`);
    showContentModal(data.data);
  } catch (e) {
    showToast('加载内容失败', 'error');
  }
}

function showContentModal(content) {
  const modalHtml = `
    <div class="modal-overlay" onclick="closeModal(event)">
      <div class="modal" onclick="event.stopPropagation()">
        <div class="modal-header">
          <h3 class="modal-title">${content.title || '无标题'}</h3>
          <button class="modal-close" onclick="closeModal()">&times;</button>
        </div>
        <div class="modal-body">
          <div class="flex gap-2 mb-4">
            <span class="content-type-badge content-type-${content.content_type}">
              ${getContentIcon(content.content_type)} ${getContentTypeName(content.content_type)}
            </span>
            <span class="text-muted">${formatDate(content.created_at)}</span>
          </div>
          
          ${content.url ? `
            <div class="form-group">
              <label class="form-label">来源 URL</label>
              <a href="${content.url}" target="_blank" class="form-input" style="display: block; color: var(--primary-color); text-decoration: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                ${content.url}
              </a>
            </div>
          ` : ''}
          
          ${content.summary ? `
            <div class="form-group">
              <label class="form-label">AI 摘要</label>
              <div class="card">
                <div class="card-body" style="padding: 0.75rem; font-size: 0.875rem;">
                  ${content.summary}
                </div>
              </div>
            </div>
          ` : ''}
          
          ${content.tags ? `
            <div class="form-group">
              <label class="form-label">标签</label>
              <div class="flex gap-2 flex-wrap">
                ${content.tags.split(',').map(tag => `<span class="tag">${tag.trim()}</span>`).join('')}
              </div>
            </div>
          ` : ''}
          
          ${content.extracted_text ? `
            <div class="form-group">
              <label class="form-label">提取内容</label>
              <div class="card">
                <div class="card-body" style="padding: 0.75rem; font-size: 0.875rem; max-height: 300px; overflow-y: auto; white-space: pre-wrap;">
                  ${content.extracted_text}
                </div>
              </div>
            </div>
          ` : ''}
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="editContent(${content.id})">编辑</button>
          ${content.content_type === 'image' ? `<button class="btn btn-primary" onclick="runOCR(${content.id})">OCR 识别</button>` : ''}
          <button class="btn btn-primary" onclick="runAI(${content.id})">AI 处理</button>
          <button class="btn btn-danger" onclick="deleteContent(${content.id}); closeModal();">删除</button>
        </div>
      </div>
    </div>
  `;
  
  document.getElementById('modal-container').innerHTML = modalHtml;
}

async function editContent(id) {
  try {
    const data = await apiRequest(`/api/contents/${id}`);
    const content = data.data;
    
    const modalHtml = `
      <div class="modal-overlay" onclick="closeModal(event)">
        <div class="modal" onclick="event.stopPropagation()">
          <div class="modal-header">
            <h3 class="modal-title">编辑内容</h3>
            <button class="modal-close" onclick="closeModal()">&times;</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label">标题</label>
              <input type="text" class="form-input" id="edit-title" value="${content.title || ''}">
            </div>
            <div class="form-group">
              <label class="form-label">标签（逗号分隔）</label>
              <input type="text" class="form-input" id="edit-tags" value="${content.tags || ''}">
            </div>
            <div class="form-group">
              <label class="form-label">摘要</label>
              <textarea class="form-textarea" id="edit-summary" style="min-height: 100px;">${content.summary || ''}</textarea>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" onclick="closeModal()">取消</button>
            <button class="btn btn-primary" onclick="saveContentEdit(${id})">保存</button>
          </div>
        </div>
      </div>
    `;
    
    document.getElementById('modal-container').innerHTML = modalHtml;
  } catch (e) {
    showToast('加载内容失败', 'error');
  }
}

async function saveContentEdit(id) {
  const title = document.getElementById('edit-title').value;
  const tags = document.getElementById('edit-tags').value;
  const summary = document.getElementById('edit-summary').value;
  
  try {
    await apiRequest(`/api/contents/${id}`, {
      method: 'PUT',
      body: { title, tags, summary }
    });
    
    showToast('已保存', 'success');
    closeModal();
    loadContents();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function runAI(id) {
  try {
    showToast('正在处理...', 'info');
    const data = await apiRequest(`/api/contents/${id}/process-ai`, {
      method: 'POST'
    });
    
    showToast('AI 处理完成', 'success');
    closeModal();
    viewContent(id);
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function runOCR(id) {
  try {
    showToast('正在识别...', 'info');
    const data = await apiRequest(`/api/contents/${id}/ocr`, {
      method: 'POST'
    });
    
    showToast('OCR 识别完成', 'success');
    closeModal();
    viewContent(id);
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function deleteContent(id) {
  if (!confirm('确定要删除此内容吗？')) return;
  
  try {
    await apiRequest(`/api/contents/${id}`, {
      method: 'DELETE'
    });
    
    showToast('已删除', 'success');
    loadContents();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

function closeModal(event) {
  if (event && event.target !== event.currentTarget) return;
  document.getElementById('modal-container').innerHTML = '';
}

let selectedFile = null;

function initAddContent() {
  document.querySelectorAll('#add-tabs .tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('#add-tabs .tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.add-tab-panel').forEach(p => p.classList.remove('active'));
      
      tab.classList.add('active');
      const tabName = tab.dataset.addTab;
      document.getElementById(`add-${tabName}-tab`).classList.add('active');
    });
  });
  
  const dropZone = document.getElementById('file-drop-zone');
  const fileInput = document.getElementById('file-input');
  
  dropZone.addEventListener('click', () => fileInput.click());
  
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });
  
  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
  });
  
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  });
  
  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleFileSelect(e.target.files[0]);
    }
  });
  
  document.getElementById('add-url-btn').addEventListener('click', handleAddUrl);
  document.getElementById('add-text-btn').addEventListener('click', handleAddText);
  document.getElementById('add-file-btn').addEventListener('click', handleAddFile);
}

function handleFileSelect(file) {
  selectedFile = file;
  
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf', 'text/plain'];
  const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf', '.txt'];
  
  const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
  const isValidType = allowedTypes.includes(file.type) || allowedExtensions.includes(ext);
  
  if (!isValidType) {
    showToast('不支持的文件类型', 'error');
    return;
  }
  
  const previewContainer = document.getElementById('file-preview-container');
  previewContainer.style.display = 'block';
  previewContainer.innerHTML = `
    <div class="file-preview">
      <div class="file-preview-icon">${getFileIcon(file.type, ext)}</div>
      <div class="file-preview-info">
        <div class="file-preview-name">${file.name}</div>
        <div class="file-preview-size">${formatFileSize(file.size)}</div>
      </div>
      <button class="btn btn-danger btn-sm" onclick="clearFileSelection()">×</button>
    </div>
  `;
  
  document.getElementById('add-file-btn').disabled = false;
}

function getFileIcon(type, ext) {
  if (type.startsWith('image/')) return '🖼️';
  if (type === 'application/pdf' || ext === '.pdf') return '📄';
  if (type === 'text/plain' || ext === '.txt') return '📝';
  return '📁';
}

function clearFileSelection() {
  selectedFile = null;
  document.getElementById('file-preview-container').style.display = 'none';
  document.getElementById('file-input').value = '';
  document.getElementById('add-file-btn').disabled = true;
}

async function handleAddUrl() {
  const url = document.getElementById('add-url-input').value.trim();
  const autoAI = document.getElementById('add-url-auto-ai').checked;
  const fullContent = document.getElementById('add-url-full').checked;
  
  if (!url) {
    showToast('请输入 URL', 'error');
    return;
  }
  
  const btn = document.getElementById('add-url-btn');
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner" style="width: 1rem; height: 1rem;"></div> 处理中...';
  
  try {
    const data = await apiRequest('/api/contents/url', {
      method: 'POST',
      body: { url, auto_ai: autoAI, full_content: fullContent }
    });
    
    showToast(data.message || '保存成功', 'success');
    document.getElementById('add-url-input').value = '';
    navigateTo('contents');
  } catch (e) {
    showToast(e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

async function handleAddText() {
  const title = document.getElementById('add-text-title').value.trim();
  const text = document.getElementById('add-text-content').value.trim();
  const autoAI = document.getElementById('add-text-auto-ai').checked;
  
  if (!text) {
    showToast('请输入文本内容', 'error');
    return;
  }
  
  const btn = document.getElementById('add-text-btn');
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner" style="width: 1rem; height: 1rem;"></div> 处理中...';
  
  try {
    const data = await apiRequest('/api/contents/text', {
      method: 'POST',
      body: { title, text, auto_ai: autoAI }
    });
    
    showToast(data.message || '保存成功', 'success');
    document.getElementById('add-text-title').value = '';
    document.getElementById('add-text-content').value = '';
    navigateTo('contents');
  } catch (e) {
    showToast(e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

async function handleAddFile() {
  if (!selectedFile) {
    showToast('请选择文件', 'error');
    return;
  }
  
  const autoAI = document.getElementById('add-file-auto-ai').checked;
  const autoOCR = document.getElementById('add-file-auto-ocr').checked;
  
  const btn = document.getElementById('add-file-btn');
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner" style="width: 1rem; height: 1rem;"></div> 上传中...';
  
  try {
    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('auto_ai', autoAI);
    formData.append('auto_ocr', autoOCR);
    
    const response = await fetch(`${API_BASE}/api/contents/upload`, {
      method: 'POST',
      headers: sessionToken ? { 'Authorization': `Bearer ${sessionToken}` } : {},
      credentials: 'include',
      body: formData
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || '上传失败');
    }
    
    showToast(data.message || '上传成功', 'success');
    clearFileSelection();
    navigateTo('contents');
  } catch (e) {
    showToast(e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

async function loadSearch() {
  document.getElementById('search-results').innerHTML = '';
}

async function performSearch() {
  const query = document.getElementById('search-input').value.trim();
  
  if (!query || query.length < 2) {
    showToast('搜索关键词至少需要 2 个字符', 'warning');
    return;
  }
  
  const btn = document.getElementById('search-btn');
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner" style="width: 1rem; height: 1rem;"></div> 搜索中...';
  
  try {
    const data = await apiRequest(`/api/contents/search?q=${encodeURIComponent(query)}`);
    renderSearchResults(data.data.results, query);
  } catch (e) {
    showToast(e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

function renderSearchResults(results, query) {
  const container = document.getElementById('search-results');
  
  if (!results || results.length === 0) {
    container.innerHTML = `
      <div class="card">
        <div class="card-body">
          <div class="empty-state">
            <div class="empty-state-icon">🔍</div>
            <div class="empty-state-title">未找到相关内容</div>
            <div class="empty-state-text">尝试使用其他关键词搜索</div>
          </div>
        </div>
      </div>
    `;
    return;
  }
  
  container.innerHTML = `
    <div class="card" style="margin-bottom: 1rem;">
      <div class="card-body">
        <div class="text-muted">找到 ${results.length} 条相关内容</div>
      </div>
    </div>
    <div class="card">
      ${results.map(content => `
        <div class="list-item">
          <div class="content-type-badge content-type-${content.content_type}" style="flex-shrink: 0;">
            ${getContentIcon(content.content_type)}
          </div>
          <div class="list-item-content">
            <div class="list-item-title">${highlightText(content.title, query) || '无标题'}</div>
            ${content.summary ? `<div class="text-muted" style="font-size: 0.8rem; margin-top: 0.25rem;">${highlightText(content.summary, query).substring(0, 200)}...</div>` : ''}
            <div class="list-item-meta mt-2">
              <span>${getContentTypeName(content.content_type)}</span>
              <span>${formatDate(content.created_at)}</span>
            </div>
          </div>
          <div class="list-item-actions">
            <button class="btn btn-secondary btn-sm" onclick="viewContent(${content.id})">查看</button>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function highlightText(text, query) {
  if (!text) return '';
  const regex = new RegExp(`(${escapeRegExp(query)})`, 'gi');
  return text.replace(regex, '<mark style="background-color: #fef08a; padding: 0 2px; border-radius: 2px;">$1</mark>');
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function loadRSSFeeds() {
  try {
    const data = await apiRequest('/api/rss');
    renderRSSFeeds(data.data);
  } catch (e) {
    console.error('加载 RSS 失败:', e);
  }
}

function renderRSSFeeds(feeds) {
  const container = document.getElementById('rss-feeds-list');
  
  if (!feeds || feeds.length === 0) {
    container.innerHTML = `
      <div class="card">
        <div class="card-body">
          <div class="empty-state">
            <div class="empty-state-icon">📰</div>
            <div class="empty-state-title">暂无订阅源</div>
            <div class="empty-state-text">添加 RSS 订阅源，自动获取最新资讯</div>
            <button class="btn btn-primary mt-4" onclick="showAddRSSModal()">
              ➕ 添加订阅源
            </button>
          </div>
        </div>
      </div>
    `;
    return;
  }
  
  container.innerHTML = feeds.map(feed => `
    <div class="card" style="margin-bottom: 1rem;">
      <div class="card-header">
        <div class="flex items-center gap-2">
          <span class="card-title">${feed.name}</span>
          ${feed.unreadCount > 0 ? `<span class="unread-badge">${feed.unreadCount}</span>` : ''}
        </div>
        <div class="flex gap-2">
          <button class="btn btn-secondary btn-sm" onclick="refreshRSSFeed(${feed.id})">🔄 刷新</button>
          <button class="btn btn-danger btn-sm" onclick="deleteRSSFeed(${feed.id})">删除</button>
        </div>
      </div>
      <div class="card-body" id="feed-items-${feed.id}" style="padding: 0;">
        <div class="loading" style="padding: 1rem;">
          <div class="spinner"></div>
          <span>加载文章中...</span>
        </div>
      </div>
    </div>
  `).join('');
  
  feeds.forEach(feed => loadRSSFeedItems(feed.id));
}

async function loadRSSFeedItems(feedId) {
  try {
    const data = await apiRequest(`/api/rss/${feedId}`);
    renderRSSFeedItems(feedId, data.data.items);
  } catch (e) {
    console.error('加载 RSS 文章失败:', e);
  }
}

function renderRSSFeedItems(feedId, items) {
  const container = document.getElementById(`feed-items-${feedId}`);
  
  if (!items || items.length === 0) {
    container.innerHTML = `
      <div class="text-center text-muted" style="padding: 1rem;">
        暂无文章
      </div>
    `;
    return;
  }
  
  container.innerHTML = items.map(item => `
    <div class="list-item" style="${!item.is_read ? 'background-color: #eff6ff;' : ''}">
      <div class="list-item-content">
        <div class="list-item-title" style="${!item.is_read ? 'font-weight: 600;' : ''}">${item.title || '无标题'}</div>
        <div class="list-item-meta">
          <span>${formatDate(item.pub_date)}</span>
          ${!item.is_read ? '<span class="badge badge-primary">未读</span>' : ''}
        </div>
      </div>
      <div class="list-item-actions">
        <button class="btn btn-secondary btn-sm" onclick="openRSSItem('${item.link}')">🔗</button>
        <button class="btn btn-primary btn-sm" onclick="saveRSSItem(${item.id})">保存</button>
      </div>
    </div>
  `).join('');
}

function openRSSItem(link) {
  if (link) window.open(link, '_blank');
}

async function saveRSSItem(itemId) {
  try {
    showToast('正在保存...', 'info');
    const data = await apiRequest(`/api/rss/item/${itemId}/save`, {
      method: 'POST'
    });
    
    showToast(data.message || '已保存到知识库', 'success');
  } catch (e) {
    showToast(e.message, 'error');
  }
}

function showAddRSSModal() {
  const modalHtml = `
    <div class="modal-overlay" onclick="closeModal(event)">
      <div class="modal" onclick="event.stopPropagation()">
        <div class="modal-header">
          <h3 class="modal-title">添加 RSS 订阅源</h3>
          <button class="modal-close" onclick="closeModal()">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">RSS 源 URL</label>
            <input type="url" class="form-input" id="rss-url-input" placeholder="https://example.com/feed">
          </div>
          <div class="form-group">
            <label class="form-label">名称（可选）</label>
            <input type="text" class="form-input" id="rss-name-input" placeholder="留空则自动获取">
          </div>
          <div class="alert alert-info">
            <span>💡</span>
            <span>常见 RSS 源：知乎专栏、掘金、技术博客等通常提供 RSS 订阅</span>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="closeModal()">取消</button>
          <button class="btn btn-primary" onclick="testRSSFeed()">测试</button>
          <button class="btn btn-primary" onclick="addRSSFeed()">添加</button>
        </div>
      </div>
    </div>
  `;
  
  document.getElementById('modal-container').innerHTML = modalHtml;
}

async function testRSSFeed() {
  const url = document.getElementById('rss-url-input').value.trim();
  
  if (!url) {
    showToast('请输入 RSS URL', 'error');
    return;
  }
  
  try {
    const data = await apiRequest(`/api/rss/test?url=${encodeURIComponent(url)}`);
    
    showToast(`发现: ${data.data.title} (${data.data.itemCount} 篇文章)`, 'success');
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function addRSSFeed() {
  const url = document.getElementById('rss-url-input').value.trim();
  const name = document.getElementById('rss-name-input').value.trim();
  
  if (!url) {
    showToast('请输入 RSS URL', 'error');
    return;
  }
  
  try {
    const data = await apiRequest('/api/rss', {
      method: 'POST',
      body: { url, name }
    });
    
    showToast(data.message || '添加成功', 'success');
    closeModal();
    loadRSSFeeds();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function refreshRSSFeed(feedId) {
  try {
    showToast('正在刷新...', 'info');
    await apiRequest(`/api/rss/${feedId}/refresh`, {
      method: 'POST'
    });
    
    showToast('刷新完成', 'success');
    loadRSSFeedItems(feedId);
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function deleteRSSFeed(feedId) {
  if (!confirm('确定要删除此订阅源吗？')) return;
  
  try {
    await apiRequest(`/api/rss/${feedId}`, {
      method: 'DELETE'
    });
    
    showToast('已删除', 'success');
    loadRSSFeeds();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

let conditionTypes = [];
let actionTypes = [];

async function loadRules() {
  try {
    const [typesData, rulesData] = await Promise.all([
      apiRequest('/api/rules/types'),
      apiRequest('/api/rules')
    ]);
    
    conditionTypes = typesData.data.conditionTypes;
    actionTypes = typesData.data.actionTypes;
    
    renderRules(rulesData.data);
  } catch (e) {
    console.error('加载规则失败:', e);
  }
}

function renderRules(rules) {
  const container = document.getElementById('rules-list');
  
  if (!rules || rules.length === 0) {
    container.innerHTML = `
      <div class="card">
        <div class="card-body">
          <div class="empty-state">
            <div class="empty-state-icon">⚙️</div>
            <div class="empty-state-title">暂无规则</div>
            <div class="empty-state-text">创建自动化规则，让内容处理更高效</div>
            <button class="btn btn-primary mt-4" onclick="showAddRuleModal()">
              ➕ 创建规则
            </button>
          </div>
        </div>
      </div>
    `;
    return;
  }
  
  container.innerHTML = rules.map(rule => `
    <div class="card" style="margin-bottom: 1rem;">
      <div class="card-header">
        <div class="flex items-center gap-2">
          <span class="card-title">${rule.name}</span>
          <span class="badge ${rule.is_active ? 'badge-success' : 'badge-secondary'}">
            ${rule.is_active ? '启用' : '禁用'}
          </span>
        </div>
        <div class="flex gap-2">
          <button class="btn btn-secondary btn-sm" onclick="toggleRule(${rule.id}, ${rule.is_active ? 0 : 1})">
            ${rule.is_active ? '禁用' : '启用'}
          </button>
          <button class="btn btn-danger btn-sm" onclick="deleteRule(${rule.id})">删除</button>
        </div>
      </div>
      <div class="card-body">
        <div class="flex items-center gap-2" style="font-size: 0.875rem;">
          <span class="text-muted">当</span>
          <span class="badge badge-primary">${getConditionLabel(rule.condition_type)}</span>
          <span class="text-muted">包含</span>
          <span class="badge badge-secondary">"${rule.condition_value || '...'}"</span>
          <span class="text-muted">时</span>
          <span class="text-muted">→</span>
          <span class="badge badge-success">${getActionLabel(rule.action_type)}</span>
          <span class="text-muted">:</span>
          <span class="badge badge-warning">"${rule.action_value || '...'}"</span>
        </div>
      </div>
    </div>
  `).join('');
}

function getConditionLabel(type) {
  const t = conditionTypes.find(c => c.value === type);
  return t ? t.label : type;
}

function getActionLabel(type) {
  const a = actionTypes.find(a => a.value === type);
  return a ? a.label : type;
}

function showAddRuleModal() {
  const modalHtml = `
    <div class="modal-overlay" onclick="closeModal(event)">
      <div class="modal" onclick="event.stopPropagation()">
        <div class="modal-header">
          <h3 class="modal-title">创建规则</h3>
          <button class="modal-close" onclick="closeModal()">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">规则名称</label>
            <input type="text" class="form-input" id="rule-name-input" placeholder="例如：自动标记技术文章">
          </div>
          
          <div class="rule-condition-builder">
            <div class="rule-row">
              <span class="rule-label">条件</span>
              <div class="rule-value">
                <select class="form-select" id="rule-condition-type">
                  ${conditionTypes.map(t => `<option value="${t.value}">${t.label}</option>`).join('')}
                </select>
              </div>
            </div>
            <div class="rule-row">
              <span class="rule-label">值</span>
              <div class="rule-value">
                <input type="text" class="form-input" id="rule-condition-value" placeholder="条件值，如：技术、新闻">
              </div>
            </div>
            <div class="rule-row">
              <span class="rule-label">操作</span>
              <div class="rule-value">
                <select class="form-select" id="rule-action-type">
                  ${actionTypes.map(t => `<option value="${t.value}">${t.label}</option>`).join('')}
                </select>
              </div>
            </div>
            <div class="rule-row">
              <span class="rule-label">值</span>
              <div class="rule-value">
                <input type="text" class="form-input" id="rule-action-value" placeholder="操作值，如：技术标签">
              </div>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="closeModal()">取消</button>
          <button class="btn btn-primary" onclick="addRule()">创建</button>
        </div>
      </div>
    </div>
  `;
  
  document.getElementById('modal-container').innerHTML = modalHtml;
}

async function addRule() {
  const name = document.getElementById('rule-name-input').value.trim();
  const conditionType = document.getElementById('rule-condition-type').value;
  const conditionValue = document.getElementById('rule-condition-value').value.trim();
  const actionType = document.getElementById('rule-action-type').value;
  const actionValue = document.getElementById('rule-action-value').value.trim();
  
  if (!name) {
    showToast('请输入规则名称', 'error');
    return;
  }
  
  try {
    await apiRequest('/api/rules', {
      method: 'POST',
      body: {
        name,
        condition_type: conditionType,
        condition_value: conditionValue,
        action_type: actionType,
        action_value: actionValue
      }
    });
    
    showToast('规则创建成功', 'success');
    closeModal();
    loadRules();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function toggleRule(id, isActive) {
  try {
    await apiRequest(`/api/rules/${id}`, {
      method: 'PUT',
      body: { is_active: isActive }
    });
    
    showToast(isActive ? '已启用' : '已禁用', 'success');
    loadRules();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function deleteRule(id) {
  if (!confirm('确定要删除此规则吗？')) return;
  
  try {
    await apiRequest(`/api/rules/${id}`, {
      method: 'DELETE'
    });
    
    showToast('已删除', 'success');
    loadRules();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function loadSettings() {
  try {
    const data = await apiRequest('/api/auth/me');
    const user = data.data.user;
    
    document.getElementById('settings-username').value = user.username;
    document.getElementById('settings-created-at').value = formatDate(user.created_at);
    
    if (user.hasApiKey) {
      document.getElementById('api-key-status').innerHTML = `
        <div class="alert alert-success">
          <span>✅</span>
          <span>API Key 已配置</span>
        </div>
      `;
    } else {
      document.getElementById('api-key-status').innerHTML = `
        <div class="alert alert-warning">
          <span>⚠️</span>
          <span>API Key 未配置，AI 功能不可用</span>
        </div>
      `;
    }
  } catch (e) {
    console.error('加载设置失败:', e);
  }
}

function initSettings() {
  document.getElementById('toggle-api-key').addEventListener('click', () => {
    const input = document.getElementById('api-key-input');
    const btn = document.getElementById('toggle-api-key');
    
    if (input.type === 'password') {
      input.type = 'text';
      btn.textContent = '隐藏';
    } else {
      input.type = 'password';
      btn.textContent = '显示';
    }
  });
  
  document.getElementById('save-api-key-btn').addEventListener('click', async () => {
    const apiKey = document.getElementById('api-key-input').value.trim();
    
    try {
      const data = await apiRequest('/api/auth/api-key', {
        method: 'PUT',
        body: { apiKey }
      });
      
      showToast(data.message, 'success');
      loadSettings();
    } catch (e) {
      showToast(e.message, 'error');
    }
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  document.querySelectorAll('.sidebar-nav-item').forEach(item => {
    item.addEventListener('click', () => {
      navigateTo(item.dataset.page);
    });
  });
  
  document.querySelectorAll('#auth-tabs .tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('#auth-tabs .tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      
      tab.classList.add('active');
      const tabName = tab.dataset.tab;
      document.getElementById(`${tabName}-tab`).classList.add('active');
    });
  });
  
  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;
    
    try {
      await login(username, password);
    } catch (e) {
      showToast(e.message, 'error');
    }
  });
  
  document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('register-username').value;
    const password = document.getElementById('register-password').value;
    const passwordConfirm = document.getElementById('register-password-confirm').value;
    
    if (password !== passwordConfirm) {
      showToast('两次输入的密码不一致', 'error');
      return;
    }
    
    try {
      await register(username, password);
    } catch (e) {
      showToast(e.message, 'error');
    }
  });
  
  document.getElementById('logout-btn').addEventListener('click', logout);
  
  document.getElementById('content-type-filter').addEventListener('change', (e) => {
    currentFilter = e.target.value;
    loadContents();
  });
  
  document.getElementById('search-btn').addEventListener('click', performSearch);
  document.getElementById('search-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') performSearch();
  });
  
  document.getElementById('add-rss-feed-btn').addEventListener('click', showAddRSSModal);
  document.getElementById('add-rule-btn').addEventListener('click', showAddRuleModal);
  
  initAddContent();
  initSettings();
  
  const isAuthenticated = await checkAuth();
  
  if (isAuthenticated) {
    showMainPage();
    loadDashboard();
  } else {
    showLoginPage();
  }
});
