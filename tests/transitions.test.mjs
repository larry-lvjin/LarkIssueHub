import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateTransitions, timestamp, dateKey } from '../lib/transitions.mjs';
const now = Date.parse('2026-10-28T22:00:00+08:00');
function log(no, status = '重新打开', at = '2026-10-27T23:10:00+08:00', id = `rec${no}`) {
  return { fields: { '记录ID': [{ text: id }], 'Bug编号': [{ text: String(no) }], '目标状态': status, '变更时间': timestamp(at) ?? at } };
}
const metric = (data, day = '2026-10-27', key = 'reopened') => data.series.find(r => r.date === day).metrics[key];
test('2245 从其他状态转入重新打开：1（2245）', () => {
  const d = aggregateTransitions([log(2245)], { now });
  const s = metric(d);
  assert.equal(s.count, 1);
  assert.equal(s.items[0].bugNo, '2245');
  assert.equal(s.quality, 'partial');
});
test('同一天同一 Bug 多次转入同一状态只计一次', () => {
  const d = aggregateTransitions([log(2245), log(2245, '重新打开', '2026-10-27T23:30:00+08:00')], { now });
  assert.equal(metric(d).count, 1);
  assert.equal(metric(d).items[0].logCount, 2);
  assert.equal(d.diagnostics.duplicate, 1);
});
test('跨天转入独立计数，按北京时间，不按电脑时区', () => {
  const d = aggregateTransitions([log(2245), log(2245, '重新打开', '2026-10-27T16:10:00Z')], { now });
  assert.equal(metric(d).count, 1);
  assert.equal(metric(d, '2026-10-28').count, 1);
});
test('同一天分别转入两个目标状态分别计数', () => {
  const d = aggregateTransitions([log(2245), log(2245, '未解决')], { now });
  assert.equal(metric(d).count, 1);
  assert.equal(metric(d, '2026-10-27', 'unresolved').count, 1);
});
test('去重按来源记录 ID；重复的展示序号不能合并不同 Bug', () => {
  const d = aggregateTransitions([log(2245), log(2245, '重新打开', undefined, 'recOther')], { now });
  assert.equal(metric(d).count, 2);
});
test('没有观测到该状态日志的日期为未验证，不伪造 0', () => {
  const d = aggregateTransitions([], { now });
  assert.equal(metric(d).count, null);
  assert.equal(metric(d).quality, 'unverified');
});
test('已观测日志之后无转入记录时为 0，今日标明截至取数时', () => {
  const d = aggregateTransitions([log(2245)], { now });
  assert.equal(metric(d, '2026-10-28').count, 0);
  assert.equal(metric(d, '2026-10-28').quality, 'today');
});
test('采集前、未来、无效时间、无效 ID、说明记录不参与计数', () => {
  const d = aggregateTransitions([
    log(2245), log(2, '重新打开', '2026-10-27T20:00:00+08:00'),
    log(3, '重新打开', '2026-10-29T00:00:00+08:00'),
    log(4, '重新打开', '2026-02-30 23:10:00'),
    log(5, '重新打开', undefined, '不是记录ID'), { fields: { 类型: '日期' } }, log(6, '已关闭'),
  ], { now });
  assert.equal(metric(d).count, 1);
  for (const key of ['beforeStart', 'future', 'invalidTime', 'invalidId', 'blank', 'otherStatus']) assert.equal(d.diagnostics[key], 1, key);
});
test('缺序号仍计来源记录，不编造序号；同一来源的序号冲突显式保留', () => {
  const d = aggregateTransitions([log('', '重新打开', undefined, 'recMissing'), log(2245), log(2299, '重新打开', undefined, 'rec2245')], { now });
  assert.equal(metric(d).count, 2);
  assert.equal(d.diagnostics.missingNumber, 1);
  assert.equal(d.diagnostics.numberConflicts, 1);
  assert.equal(metric(d).items.find(i => i.recordId === 'rec2245').bugNo, '2245 / 2299');
});
test('序号使用数值自然排序，重复日志排序不影响统计', () => {
  const rows = [log(99), log(8), log(100)];
  const d = aggregateTransitions(rows, { now });
  assert.deepEqual(metric(d).items.map(i => i.bugNo), ['8', '99', '100']);
  assert.deepEqual(d, aggregateTransitions([...rows].reverse(), { now }));
});
test('数字毫秒时间、明确时区和北京时间文本兼容；无时间、无效日期拒绝', () => {
  assert.equal(dateKey(timestamp('2026-10-27 23:59:59')), '2026-10-27');
  assert.equal(dateKey(timestamp('2026-10-27T16:00:00Z')), '2026-10-28');
  assert.equal(timestamp(String(now)), now);
  assert.equal(timestamp('2026-10-27'), null);
  assert.equal(timestamp('2026-13-01 23:10:00'), null);
  assert.equal(timestamp('2026-02-30 23:10:00'), null);
});
