import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
// 只开放静态展示文件，绝不通过 HTTP 暴露 .env.local、.git 或脚本。
const FILES = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
  ['/lib/transitions.mjs', ['lib/transitions.mjs', 'text/javascript; charset=utf-8']],
  ['/lib/chart-data.mjs', ['lib/chart-data.mjs', 'text/javascript; charset=utf-8']],
  ['/data/stats.json', ['data/stats.json', 'application/json; charset=utf-8']],
]);
export function createStaticServer(root) {
  return createServer(async (req, res) => {
    const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, headers).end(); return; }
    let path;
    try { path = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname); }
    catch { res.writeHead(400, headers).end(); return; }
    const file = FILES.get(path);
    if (!file) { res.writeHead(404, headers).end('Not found'); return; }
    try {
      const bytes = await readFile(resolve(root, file[0]));
      res.writeHead(200, { ...headers, 'Content-Type': file[1] });
      res.end(req.method === 'HEAD' ? undefined : bytes);
    } catch { res.writeHead(404, headers).end('Not found'); }
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const port = Number(process.argv[2] || 3000);
  const server = createStaticServer(root);
  server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `端口 ${port} 已被占用，可运行 node scripts/serve.mjs 3001` : '静态服务启动失败'); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => console.log(`看板地址：http://127.0.0.1:${server.address().port}（仅本机；密钥文件不对外提供）`));
}
