'use strict';

const CONFIG = {
  title: 'Bug Tracker 管理台',
  sourceRepo: 'larry-lvjin/LarkBugTracker',
  branch: 'main',
  liveUrl: '',
  pluginUrl: '',
  baseUrl: '',
};

const AUTO_URL = './data/automations.json';
const TOLERANCE_MS = 5 * 60 * 1000;
const HOOK_KEY = 'issuehub.webhook';

const el = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, '0');

function fmtTime(value) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
         `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function showError(message) {
  el('error').textContent = message;
  el('error').hidden = false;
}

function clearError() {
  el('error').hidden = true;
  el('error').textContent = '';
}

/* ---------- 配置 ---------- */

async function loadConfig() {
  try {
    const res = await fetch('./config.json', { cache: 'no-store' });
    if (res.ok) Object.assign(CONFIG, await res.json());
  } catch { /* 用默认值 */ }

  const [owner, repo] = CONFIG.sourceRepo.split('/');
  const gh = `https://github.com/${owner}/${repo}`;

  document.title = CONFIG.title;
  el('pageTitle').textContent = CONFIG.title;
  el('repoLink').href = gh;
  el('pluginLink').href = CONFIG.pluginUrl || gh;
  el('baseLink').href = CONFIG.baseUrl || gh;
  el('downloadLink').href = `https://codeload.github.com/${owner}/${repo}/tar.gz/refs/heads/${CONFIG.branch}`;
  el('distLink').href = `${gh}/tree/${CONFIG.branch}/dist`;
}

/* ---------- 版本与提交 ---------- */

function rawUrl(path) {
  const [owner, repo] = CONFIG.sourceRepo.split('/');
  return `https://raw.githubusercontent.com/${owner}/${repo}/${CONFIG.branch}/${path}`;
}

function apiUrl(path) {
  const [owner, repo] = CONFIG.sourceRepo.split('/');
  return `https://api.github.com/repos/${owner}/${repo}${path}`;
}

async function fetchRepoVersion() {
  const res = await fetch(rawUrl('package.json'), { cache: 'no-store' });
  if (!res.ok) throw new Error(`package.json ${res.status}`);
  const pkg = await res.json();
  return { version: pkg.version || '', name: pkg.name || '' };
}

/** 从托管地址取出构建号（毫秒时间戳）并换算成时间。 */
function parseBuild(url) {
  if (!url) return { buildId: '', builtAt: null };
  const numeric = url.split('/').filter((p) => /^\d{10,}$/.test(p));
  const id = numeric[numeric.length - 1] || '';
  const ms = id ? Number(id) : 0;
  return { buildId: id, builtAt: ms > 0 ? new Date(ms) : null };
}

async function fetchCommits() {
  const res = await fetch(apiUrl('/commits?per_page=20'), {
    headers: { Accept: 'application/vnd.github+json' },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`commits ${res.status}`);
  return res.json();
}

function renderCommits(commits) {
  const list = el('commits');
  list.textContent = '';
  if (!Array.isArray(commits) || commits.length === 0) {
    const li = document.createElement('li');
    li.className = 'loading';
    li.textContent = '暂无提交记录';
    list.appendChild(li);
    el('commitCount').textContent = '';
    return;
  }
  el('commitCount').textContent = `共 ${commits.length} 条`;

  for (const c of commits) {
    const li = document.createElement('li');

    const top = document.createElement('div');
    top.className = 'commit-top';
    const msg = document.createElement('span');
    msg.className = 'commit-msg';
    msg.textContent = (c.commit?.message || '').split('\n')[0].trim() || '(无提交说明)';
    top.appendChild(msg);

    const meta = document.createElement('div');
    meta.className = 'commit-meta';

    const link = document.createElement('a');
    link.className = 'commit-sha';
    link.href = `https://github.com/${CONFIG.sourceRepo}/commit/${c.sha}`;
    link.target = '_blank';
    link.rel = 'noreferrer';
    link.textContent = c.sha ? c.sha.slice(0, 7) : '';
    meta.appendChild(link);

    const dateSpan = document.createElement('span');
    dateSpan.textContent = fmtTime(c.commit?.author?.date || '');
    meta.appendChild(dateSpan);

    const author = c.commit?.author?.name || c.author?.login || '';
    if (author) {
      const authorSpan = document.createElement('span');
      authorSpan.textContent = author;
      meta.appendChild(authorSpan);
    }

    li.appendChild(top);
    li.appendChild(meta);
    list.appendChild(li);
  }
}

function renderSync({ repoVersion, live, lastCommitDate }) {
  const state = el('state');
  const hint = el('stateHint');
  const card = state.closest('.card');

  if (live.builtAt && lastCommitDate) {
    const commitAt = new Date(lastCommitDate);
    if (Number.isNaN(commitAt.getTime())) {
      state.textContent = '无法判断';
      hint.textContent = '提交时间格式异常';
      card.dataset.state = 'unknown';
      return;
    }
    if (commitAt.getTime() > live.builtAt.getTime() + TOLERANCE_MS) {
      state.textContent = '待更新';
      hint.textContent = `仓库最后提交 ${fmtTime(commitAt)} 晚于线上构建 ${fmtTime(live.builtAt)}`;
      card.dataset.state = 'behind';
    } else {
      state.textContent = '已同步';
      hint.textContent = `线上构建 ${fmtTime(live.builtAt)} 已包含最后提交`;
      card.dataset.state = 'ok';
    }
    return;
  }

  state.textContent = '无法判断';
  hint.textContent = repoVersion ? '缺少线上构建时间' : '缺少仓库版本信息';
  card.dataset.state = 'unknown';
}

/* ---------- 自动化流程 ---------- */

function renderAutomations(payload) {
  const list = el('automations');
  list.textContent = '';
  const meta = el('autoMeta');

  if (!payload || !Array.isArray(payload.workflows)) {
    meta.textContent = '未生成数据';
    const li = document.createElement('li');
    li.className = 'loading';
    li.textContent = '还没有 data/automations.json，先在本地执行 npm run automations';
    list.appendChild(li);
    return;
  }

  meta.textContent = `${payload.workflows.length} 条 · 生成于 ${fmtTime(payload.generatedAt)}`;

  if (payload.workflows.length === 0) {
    const li = document.createElement('li');
    li.className = 'loading';
    li.textContent = '这张表还没有自动化流程';
    list.appendChild(li);
    return;
  }

  for (const w of payload.workflows) {
    const li = document.createElement('li');
    li.className = 'auto-item';

    const title = document.createElement('span');
    title.className = 'auto-title';
    title.textContent = w.title || '(未命名流程)';
    li.appendChild(title);

    const enabled = String(w.status || '').toLowerCase() === 'enable';
    const badge = document.createElement('span');
    badge.className = 'badge ' + (enabled ? 'badge-on' : 'badge-off');
    badge.textContent = enabled ? '已开启' : '已关闭';
    li.appendChild(badge);

    const id = document.createElement('span');
    id.className = 'auto-id';
    id.textContent = w.workflow_id || '';
    li.appendChild(id);

    list.appendChild(li);
  }
}

async function loadAutomations() {
  try {
    const res = await fetch(AUTO_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(String(res.status));
    renderAutomations(await res.json());
  } catch {
    renderAutomations(null);
  }
}

/* ---------- 机器人通知 ---------- */

function setHookResult(text) {
  el('hookResult').textContent = text;
}

function loadHook() {
  try {
    const saved = localStorage.getItem(HOOK_KEY);
    if (saved) el('hookUrl').value = saved;
  } catch { /* 浏览器可能禁用存储 */ }
}

function saveHook() {
  const url = el('hookUrl').value.trim();
  if (!url) { setHookResult('请先填写 Webhook 地址'); return; }
  try {
    localStorage.setItem(HOOK_KEY, url);
    setHookResult('已保存到本机浏览器');
  } catch {
    setHookResult('无法写入 localStorage，浏览器可能禁用了存储');
  }
}

async function sendWebhook() {
  const url = el('hookUrl').value.trim();
  const text = el('hookText').value.trim();
  if (!url) { setHookResult('请先填写 Webhook 地址'); return; }
  if (!text) { setHookResult('请先填写消息内容'); return; }

  const body = JSON.stringify({ msg_type: 'text', content: { text } });
  const btn = el('hookSend');
  btn.disabled = true;
  setHookResult('发送中…');

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    const data = await res.json().catch(() => null);
    const code = data && (data.code ?? data.StatusCode);
    if (code === 0) {
      setHookResult('发送成功');
    } else {
      const detail = data ? (data.msg || JSON.stringify(data).slice(0, 120)) : `HTTP ${res.status}`;
      setHookResult(`发送失败：${detail}`);
    }
  } catch {
    // 飞书 webhook 一般不放行 CORS，退回不读响应的一次性提交
    try {
      await fetch(url, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body,
      });
      setHookResult('已提交（跨域限制读不到飞书返回，请到群里确认）');
    } catch {
      setHookResult('发送失败：网络错误或被浏览器拦截');
    }
  } finally {
    btn.disabled = false;
  }
}

/* ---------- 启动 ---------- */

async function load() {
  const btn = el('refresh');
  btn.disabled = true;
  clearError();

  el('state').textContent = '检查中…';
  el('stateHint').textContent = '正在读取仓库与线上信息';

  const [repoResult, commitResult] = await Promise.allSettled([
    fetchRepoVersion(),
    fetchCommits(),
  ]);

  let repoVersion = '';
  if (repoResult.status === 'fulfilled') {
    repoVersion = repoResult.value.version;
    el('repoVersion').textContent = repoVersion ? `v${repoVersion}` : '—';
    el('repoBuild').textContent = repoResult.value.name || '构建产物 dist/';
  } else {
    el('repoVersion').textContent = '读取失败';
    el('repoBuild').textContent = repoResult.reason?.message || '';
    showError('无法读取仓库 package.json，请检查网络或仓库是否公开。');
  }

  const live = parseBuild(CONFIG.liveUrl);
  if (live.builtAt) {
    el('liveVersion').textContent = fmtTime(live.builtAt).slice(0, 10);
    el('liveHint').textContent = `构建号 ${live.buildId}`;
  } else {
    el('liveVersion').textContent = '未配置';
    el('liveHint').textContent = '在 config.json 填 liveUrl';
  }

  let lastCommitDate = '';
  if (commitResult.status === 'fulfilled') {
    lastCommitDate = commitResult.value?.[0]?.commit?.author?.date || '';
    renderCommits(commitResult.value);
  } else {
    renderCommits([]);
    showError('无法读取提交记录，GitHub 接口可能被限流，稍后重试。');
  }

  renderSync({ repoVersion, live, lastCommitDate });
  el('updated').textContent = `检查于 ${fmtTime(new Date())}`;
  btn.disabled = false;
}

el('refresh').addEventListener('click', load);
el('autoReload').addEventListener('click', loadAutomations);
el('hookSave').addEventListener('click', saveHook);
el('hookSend').addEventListener('click', sendWebhook);
el('hookClear').addEventListener('click', () => {
  el('hookUrl').value = '';
  el('hookText').value = '';
  try { localStorage.removeItem(HOOK_KEY); } catch { /* ignore */ }
  setHookResult('已清除');
});

(async () => {
  await loadConfig();
  loadHook();
  loadAutomations();
  await load();
})();
