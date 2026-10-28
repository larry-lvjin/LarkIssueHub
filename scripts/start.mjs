import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStaticServer } from './serve.mjs';
import { collectStats } from './fetch-stats.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.argv[2] || 3000);
const server = createStaticServer(ROOT);
let stopping = false;
let timer;
async function cycle() {
  const started = Date.now();
  try { await collectStats(); }
  catch (error) { console.error('本轮取数失败，保留上次快照：' + error.message); }
  if (!stopping) timer = setTimeout(cycle, Math.max(1000, 60000 - (Date.now() - started)));
}
server.on('error', error => {
  console.error(error.code === 'EADDRINUSE' ? `端口 ${port} 已被占用，可使用 node scripts/start.mjs 3001` : '本地看板启动失败');
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () => {
  console.log(`实时看板：http://127.0.0.1:${server.address().port}`);
  console.log('本地脚本约每60秒读取主表和状态日志；页面每30秒自动读取快照。按 Ctrl+C 停止。');
  cycle();
});
function stop() {
  stopping = true;
  clearTimeout(timer);
  server.close(() => process.exit(0));
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
