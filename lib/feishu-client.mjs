import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export async function loadEnv(root) {
  let text = '';
  try { text = await readFile(resolve(root, '.env.local'), 'utf8'); }
  catch (error) { if (error.code !== 'ENOENT') throw new Error('无法读取本地凭据文件'); }
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    env[match[1]] = value;
  }
  for (const key of ['FEISHU_APP_ID', 'FEISHU_APP_SECRET', 'FEISHU_WIKI_TOKEN', 'FEISHU_APP_TOKEN', 'FEISHU_LOG_TABLE_ID', 'FEISHU_BUG_TABLE_ID']) {
    if (process.env[key] !== undefined) env[key] = process.env[key].trim();
  }
  if (!env.FEISHU_APP_ID || !env.FEISHU_APP_SECRET) throw new Error('请在 .env.local 填写 FEISHU_APP_ID 和 FEISHU_APP_SECRET（不要贴到聊天里）');
  if (!env.FEISHU_APP_TOKEN && !env.FEISHU_WIKI_TOKEN) throw new Error('请填写 FEISHU_APP_TOKEN 或 FEISHU_WIKI_TOKEN');
  return env;
}

export async function connectFeishu(env, { fetchImpl = fetch } = {}) {
  async function api(path, { token, body, stage } = {}) {
    let res;
    try {
      res = await fetchImpl('https://open.feishu.cn/open-apis' + path, {
        method: body ? 'POST' : 'GET',
        headers: { 'Content-Type': 'application/json; charset=utf-8', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(30000),
      });
    } catch { throw new Error(`${stage}：网络错误或请求超时`); }
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || data.code !== 0) throw new Error(`${stage}失败：HTTP ${res.status} / code ${data?.code ?? '未知'}（未输出凭据）`);
    return data;
  }
  const auth = await api('/auth/v3/tenant_access_token/internal', { body: { app_id: env.FEISHU_APP_ID, app_secret: env.FEISHU_APP_SECRET }, stage: '获取应用访问令牌' });
  const token = auth.tenant_access_token;
  if (!token) throw new Error('访问令牌响应为空');
  let appToken = env.FEISHU_APP_TOKEN;
  if (!appToken) {
    const node = await api(`/wiki/v2/spaces/get_node?token=${encodeURIComponent(env.FEISHU_WIKI_TOKEN)}&obj_type=wiki`, { token, stage: '解析知识库节点' });
    if (node.data?.node?.obj_type !== 'bitable' || !node.data.node.obj_token) throw new Error('知识库节点不是多维表格或未返回目标标识');
    appToken = node.data.node.obj_token;
  }
  return {
    async readAllRecords(tableId, fieldNames) {
      const records = [];
      const cursors = new Set();
      let cursor = '';
      do {
        const qs = new URLSearchParams({ page_size: '500' });
        if (cursor) qs.set('page_token', cursor);
        const data = await api(`/bitable/v1/apps/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(tableId)}/records/search?${qs}`, { token, body: { field_names: fieldNames }, stage: '读取多维表格记录' });
        if (!Array.isArray(data.data?.items)) throw new Error('日志记录响应格式不正确');
        records.push(...data.data.items);
        if (!data.data.has_more) break;
        cursor = data.data.page_token;
        if (!cursor || cursors.has(cursor)) throw new Error('日志分页不完整，未替换已有本地数据');
        cursors.add(cursor);
      } while (true);
      return records;
    },
  };
}
