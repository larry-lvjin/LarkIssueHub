/** 只读 Bug 主表当前库存和 StatusChanges 按日转入日志，生成本地快照。 */
import { mkdir, writeFile, rename } from 'node:fs/promises';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv, connectFeishu } from '../lib/feishu-client.mjs';
import { aggregateTransitions, currentStock } from '../lib/transitions.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export async function collectStats() {
  const env = await loadEnv(ROOT);
  console.log('1/4 连接飞书（只读）');
  const client = await connectFeishu(env);
  console.log('2/4 分页读取状态变更日志');
  const records = await client.readAllRecords(env.FEISHU_LOG_TABLE_ID || 'tblrtjRhMURlSlOT', ['记录ID', 'Bug编号', '变更时间', '目标状态']);
  console.log('3/4 读取 Bug 主表当前库存');
  const bugs = await client.readAllRecords(env.FEISHU_BUG_TABLE_ID || 'tbldjYSgIe55Qbcm', ['问题状态']);
  const stock = currentStock(bugs, Date.now());
  const data = { ...aggregateTransitions(records, { now: Date.now() }), stock };
  const directory = resolve(ROOT, 'data');
  const destination = resolve(directory, 'stats.json');
  const temporary = resolve(directory, 'stats.next.json');
  // 在写入和原子替换前，验证绝对路径指向本项目 data 下的预期文件。
  if (dirname(destination) !== directory || basename(destination) !== 'stats.json' || dirname(temporary) !== directory || basename(temporary) !== 'stats.next.json') throw new Error('本地数据路径验证失败');
  await mkdir(directory, { recursive: true });
  await writeFile(temporary, JSON.stringify(data, null, 2) + '\n', 'utf8');
  await rename(temporary, destination);
  console.log(`4/4 完成：当前未解决+重新打开 ${stock.open}（${stock.unresolved}+${stock.reopened}），当前待验收 ${stock.pending}`);
  console.log(`日志：扫描 ${data.diagnostics.rows} 行，有效 ${data.diagnostics.accepted} 条，重复 ${data.diagnostics.duplicate} 条`);
  for (const day of data.series) {
    console.log(day.date + ' · ' + data.metrics.map(m => {
      const stat = day.metrics[m.key];
      const numbers = stat.items.map(i => i.bugNo || '序号缺失').join('、');
      return `${m.label}：${stat.count ?? '未验证'}${numbers ? `（${numbers}）` : ''}`;
    }).join(' · '));
  }
  console.log('已更新本地快照；未写入飞书，未推送业务数据。');
  return data;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  collectStats().catch(error => { console.error(error.message); process.exitCode = 1; });
}
