/**
 * 读取 BugStats_History，生成看板数据 data/stats.json。
 * 只读，不修改多维表格。
 *
 * 用法：npm run stats
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'data/stats.json');
const BASE = 'https://open.feishu.cn/open-apis';
const HISTORY_TABLE = 'tblWn6xhMFG67AfC';

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

async function api(path, { token, method = 'GET', body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (data.code !== 0) throw new Error(`${path} code=${data.code} msg=${data.msg}`);
  return data;
}

/** 单元格可能是纯值，也可能是 {text} / [{text}]，统一取出可读值。 */
function cell(value) {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.map((v) => cell(v)).filter(Boolean).join(', ');
  if (typeof value === 'object') {
    if ('value' in value && value.value !== null && value.value !== undefined) return cell(value.value);
    if ('text' in value) return String(value.text);
    return '';
  }
  return value;
}

function num(value) {
  const n = Number(String(cell(value)).replace(/[%,，\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

const env = await readEnv();
const tokenResp = await api('/auth/v3/tenant_access_token/internal', {
  method: 'POST',
  body: { app_id: env.FEISHU_APP_ID, app_secret: env.FEISHU_APP_SECRET },
});
const token = tokenResp.tenant_access_token;

let appToken = env.FEISHU_APP_TOKEN;
if (!appToken) {
  const node = await api(`/wiki/v2/spaces/get_node?token=${env.FEISHU_WIKI_TOKEN}&obj_type=wiki`, { token });
  appToken = node.data.node.obj_token;
}

const rows = [];
let pageToken = '';
do {
  const qs = new URLSearchParams({ page_size: '500' });
  if (pageToken) qs.set('page_token', pageToken);
  const resp = await api(
    `/bitable/v1/apps/${appToken}/tables/${HISTORY_TABLE}/records/search?${qs}`,
    { token, method: 'POST', body: {} },
  );
  const items = resp.data?.items || [];
  for (const it of items) rows.push(it.fields || {});
  pageToken = resp.data?.has_more ? resp.data.page_token : '';
} while (pageToken);

const series = rows
  .map((f) => ({
    date: String(cell(f['日期'])).slice(0, 10),
    total: num(f['总数']),
    unresolved: num(f['未解决']),
    reopened: num(f['重新打开']),
    ratio: num(f['占比(%)']),
    newUnresolved: num(f['新增未解决']),
    resolved: num(f['每日解决']),
  }))
  .filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date))
  .sort((a, b) => a.date.localeCompare(b.date));

if (series.length === 0) {
  console.error('没有读到有效的历史数据，请检查 BugStats_History 表是否有记录。');
  process.exit(1);
}

const latest = series[series.length - 1];

await mkdir(dirname(OUT), { recursive: true });
await writeFile(
  OUT,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      count: series.length,
      latest,
      series,
    },
    null,
    2,
  ) + '\n',
  'utf8',
);

console.log(`完成：${series.length} 天数据，最新 ${latest.date}（总数 ${latest.total} / 未解决 ${latest.unresolved}）`);
