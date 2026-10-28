import test from 'node:test';
import assert from 'node:assert/strict';
import { connectFeishu } from '../lib/feishu-client.mjs';
import { createStaticServer } from '../scripts/serve.mjs';
import { fileURLToPath } from 'node:url';
const env = { FEISHU_APP_ID: 'fake-id', FEISHU_APP_SECRET: 'fake-secret', FEISHU_APP_TOKEN: 'fake-base' };
const reply = data => ({ ok: true, status: 200, json: async () => data });
test('读取全部分页并只请求指定日志字段', async () => {
  const calls = [];
  const responses = [ { code: 0, tenant_access_token: 'fake-token' }, { code: 0, data: { items: [{ fields: {} }], has_more: true, page_token: 'next' } }, { code: 0, data: { items: [{ fields: {} }], has_more: false } } ];
  const c = await connectFeishu(env, { fetchImpl: async (url, opts) => { calls.push({ url, opts }); return reply(responses.shift()); } });
  const fields = ['记录ID', 'Bug编号', '变更时间', '目标状态'];
  assert.equal((await c.readAllRecords('fake-table', fields)).length, 2);
  assert.match(calls[2].url, /page_token=next/);
  assert.deepEqual(JSON.parse(calls[1].opts.body), { field_names: fields });
});
test('分页不完整报错，不返回假完整结果', async () => {
  let i = 0;
  const c = await connectFeishu(env, { fetchImpl: async () => reply(i++ ? { code: 0, data: { items: [], has_more: true } } : { code: 0, tenant_access_token: 'fake-token' }) });
  await assert.rejects(c.readAllRecords('fake-table', []), /分页不完整/);
});
test('错误信息不泄漏服务返回的凭据或 API 路径', async () => {
  await assert.rejects(connectFeishu(env, { fetchImpl: async () => reply({ code: 9999, msg: 'fake-secret fake-token fake-base' }) }), error => {
    assert.match(error.message, /code 9999/);
    assert.doesNotMatch(error.message, /fake-secret|fake-token|fake-base/);
    return true;
  });
});
test('静态服务可读页面，但无法读取凭据、Git 与取数脚本', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const server = createStaticServer(root);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(base + '/')).status, 200);
    for (const path of ['/.env.local', '/%2eenv.local', '/.git/config', '/scripts/fetch-stats.mjs', '/lib/feishu-client.mjs']) assert.equal((await fetch(base + path)).status, 404, path);
    assert.equal((await fetch(base + '/', { method: 'POST' })).status, 405);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
