import test from 'node:test';
import assert from 'node:assert/strict';
import { currentStock, aggregateTransitions } from '../lib/transitions.mjs';
const now = Date.parse('2026-10-28T21:30:00+08:00');
test('主表顶部库存：未解决+重新打开之和，待验收独立计数', () => {
  const statuses = ['未解决', '未解决', '重新打开', '待验收', '待验收', '已关闭'];
  const result = currentStock(statuses.map(status => ({ fields: { '问题状态': status } })), now);
  assert.equal(result.open, 3);
  assert.equal(result.pending, 2);
  assert.equal(result.date, '2026-10-28');
});
test('库存按当前问题状态计算，不按历史转入日志计数', () => {
  const stock = currentStock([{ fields: { '问题状态': '已关闭' } }], now);
  const changes = aggregateTransitions([{ fields: { '记录ID': 'rec2245', 'Bug编号': '2245', '目标状态': '重新打开', '变更时间': now - 1000 } }], { now });
  assert.equal(stock.open, 0);
  assert.equal(changes.series.at(-1).metrics.reopened.count, 1);
});
test('缺失状态与无关状态不计入两个库存指标；兼容富文本值', () => {
  const stock = currentStock([{ fields: {} }, { fields: { '问题状态': [{ text: '未解决' }] } }, { fields: { '问题状态': '已关闭' } }], now);
  assert.equal(stock.open, 1);
  assert.equal(stock.pending, 0);
  assert.equal(stock.emptyStatus, 1);
});
