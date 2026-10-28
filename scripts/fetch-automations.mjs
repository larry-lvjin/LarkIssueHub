/**
 * 读取多维表格的自动化流程，生成 data/automations.json 供 index.html 展示。
 *
 * 用法：npm run automations
 *
 * 凭据来源（环境变量优先，其次项目根目录 .env.local）：
 *   FEISHU_APP_ID      必填
 *   FEISHU_APP_SECRET  必填，只放本地，不要提交
 *   FEISHU_WIKI_TOKEN  与 FEISHU_APP_TOKEN 二选一，用于定位多维表格
 *   FEISHU_APP_TOKEN   已知 app_token 时直接填
 *
 * 安全：只输出条数与错误码，不打印任何凭据。
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const OUT_FILE = resolve(ROOT, 'data/automations.json');
const BASE = 'https://open.feishu.cn/open-apis';

async function readEnvFile() {
  const map = {};
  try {
    const text = await readFile(resolve(ROOT, '.env.local'), 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      map[key] = value;
    }
  } catch {
    // 没有 .env.local 时退回纯环境变量
  }
  return map;
}

function pick(envMap, key) {
  return (process.env[key] || envMap[key] || '').trim();
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
  if (data.code !== 0) {
    throw new Error(`${path} -> code=${data.code} msg=${data.msg || 'unknown'}`);
  }
  return data;
}

async function getTenantToken(appId, appSecret) {
  const data = await api('/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    body: { app_id: appId, app_secret: appSecret },
  });
  if (!data.tenant_access_token) throw new Error('响应里没有 tenant_access_token');
  return data.tenant_access_token;
}

async function resolveAppToken(token, wikiToken) {
  const data = await api(
    `/wiki/v2/spaces/get_node?token=${encodeURIComponent(wikiToken)}&obj_type=wiki`,
    { token },
  );
  const node = data.data?.node;
  if (!node) throw new Error('知识库节点返回为空');
  if (node.obj_type !== 'bitable') {
    throw new Error(`该 wiki 节点不是多维表格（obj_type=${node.obj_type}）`);
  }
  return node.obj_token;
}

async function listWorkflows(token, appToken) {
  const data = await api(`/bitable/v1/apps/${appToken}/workflows`, { token });
  return data.data?.workflows || [];
}

async function main() {
  const envMap = await readEnvFile();
  const appId = pick(envMap, 'FEISHU_APP_ID');
  const appSecret = pick(envMap, 'FEISHU_APP_SECRET');
  const wikiToken = pick(envMap, 'FEISHU_WIKI_TOKEN');
  let appToken = pick(envMap, 'FEISHU_APP_TOKEN');

  if (!appId) {
    console.error('缺少 FEISHU_APP_ID。请在项目根目录 .env.local 中填写。');
    process.exit(1);
  }
  if (!appSecret) {
    console.error('缺少 FEISHU_APP_SECRET。请填进 .env.local 的 = 后面（不要发到聊天里）。');
    process.exit(1);
  }
  if (!appToken && !wikiToken) {
    console.error('缺少定位参数：FEISHU_WIKI_TOKEN 或 FEISHU_APP_TOKEN 至少填一个。');
    process.exit(1);
  }

  console.log('1/4 获取 tenant_access_token');
  const token = await getTenantToken(appId, appSecret);

  if (!appToken) {
    console.log('2/4 通过知识库节点解析 app_token');
    appToken = await resolveAppToken(token, wikiToken);
  } else {
    console.log('2/4 使用已配置的 FEISHU_APP_TOKEN');
  }

  console.log('3/4 拉取自动化流程');
  const workflows = await listWorkflows(token, appToken);

  console.log('4/4 写入本地 JSON');
  await mkdir(dirname(OUT_FILE), { recursive: true });
  await writeFile(
    OUT_FILE,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        appToken,
        count: workflows.length,
        workflows: workflows.map((w) => ({
          workflow_id: w.workflow_id,
          title: w.title,
          status: w.status,
        })),
      },
      null,
      2,
    ) + '\n',
    'utf8',
  );

  console.log(`完成：${workflows.length} 条自动化流程 -> data/automations.json`);
}

main().catch((error) => {
  console.error('失败：' + error.message);
  console.error('常见原因：应用未开启 base:workflow:read / bitable:app 权限，或未加入该多维表格协作者。');
  process.exit(1);
});
