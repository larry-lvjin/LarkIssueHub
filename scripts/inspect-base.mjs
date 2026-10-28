/**
 * 只读探查：列出多维表格的数据表与字段，用于设计看板。
 * 不读取记录内容，不修改任何东西。
 */
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://open.feishu.cn/open-apis';

async function readEnv() {
  const map = {};
  const text = await readFile(resolve(ROOT, '.env.local'), 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq > 0) map[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
  }
  return map;
}

const env = await readEnv();
const appId = env.FEISHU_APP_ID;
const appSecret = env.FEISHU_APP_SECRET;
const wikiToken = env.FEISHU_WIKI_TOKEN;

async function api(path, opts = {}) {
  const res = await fetch(BASE + path, {
    method: opts.method || 'GET',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (data.code !== 0) throw new Error(`${path} code=${data.code} msg=${data.msg}`);
  return data;
}

const tokenResp = await api('/auth/v3/tenant_access_token/internal', {
  method: 'POST',
  body: { app_id: appId, app_secret: appSecret },
});
const token = tokenResp.tenant_access_token;

let appToken = env.FEISHU_APP_TOKEN;
if (!appToken) {
  const node = await api(`/wiki/v2/spaces/get_node?token=${wikiToken}&obj_type=wiki`, { token });
  appToken = node.data.node.obj_token;
}

const tables = await api(`/bitable/v1/apps/${appToken}/tables?page_size=100`, { token });
const list = tables.data.items || [];
console.log(`数据表 ${list.length} 个：`);

for (const t of list) {
  const fields = await api(
    `/bitable/v1/apps/${appToken}/tables/${t.table_id}/fields?page_size=100`,
    { token },
  );
  const names = (fields.data.items || []).map((f) => `${f.field_name}(${f.type})`);
  console.log(`\n- ${t.name}  [${t.table_id}]`);
  console.log('  字段: ' + names.join(', '));
}
