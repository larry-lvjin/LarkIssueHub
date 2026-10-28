import test from 'node:test';
import assert from 'node:assert/strict';
import { currentStock, aggregateTransitions, isExcludedBug, hasExpectedScope } from '../lib/transitions.mjs';
const now = Date.parse('2026-10-28T22:00:00+08:00');
const bug = (recordId, module, status = '未解决') => ({ record_id: recordId, fields: { '功能模块': module, '问题状态': status } });
const log = (id, no, status = '重新打开') => ({ fields: { '记录ID': id, 'Bug编号': String(no), '目标状态': status, '变更时间': now - 1000 } });
test('所有当前库存排除GFPS、LDAC，其余模块与空模块保留', () => {
  const stock = currentStock([bug('recG', 'GFPS'), bug('recL', 'LDAC', '待验收'), bug('recB', '蓝牙'), bug('recP', '升级', '待验收'), bug('recEmpty', undefined, '重新打开')], now);
  assert.equal(stock.open, 2);
  assert.equal(stock.pending, 1);
  assert.equal(stock.total, 3);
  assert.equal(stock.excluded, 2);
});
test('多选模块只要包含任一排除项就排除，兼容文本/选项值', () => {
  for (const module of [['蓝牙', 'GFPS'], [{ name: 'LDAC' }], [{ text: 'GFPS' }], ' gfps ', 'GFPS、LDAC']) assert.equal(isExcludedBug(bug('recA', module)), true);
  assert.equal(isExcludedBug(bug('recB', ['蓝牙', '升级'])), false);
  assert.equal(isExcludedBug(bug('recB', 'GFPS优化')), false, '按模块选项匹配，不模糊删除其他模块名称');
});
test('三个目标状态转入及序号都按来源记录ID排除，不按编号猜测', () => {
  const bugs = [bug('recG', 'GFPS'), bug('recL', 'LDAC'), bug('recKeep', '蓝牙')];
  const logs = ['重新打开', '未解决', '待验收'].flatMap(status => [log('recG', 2245, status), log('recL', 2299, status), log('recKeep', 2245, status)]);
  const data = aggregateTransitions(logs, { now, bugRecords: bugs });
  for (const key of ['reopened', 'unresolved', 'pending']) {
    const stat = data.series.at(-1).metrics[key];
    assert.equal(stat.count, 1);
    assert.equal(stat.items[0].recordId, 'recKeep');
    assert.equal(stat.items[0].bugNo, '2245', '另一个合法Bug的相同编号不能被误删');
  }
  assert.equal(data.diagnostics.excludedModule, 6);
  assert.equal(hasExpectedScope(data), true);
});
test('全部转入被模块排除时显示真实过滤后0，而不是否定已确认的采集覆盖', () => {
  const data = aggregateTransitions([log('recG', 2245)], { now, bugRecords: [bug('recG', 'GFPS')] });
  assert.equal(data.series.at(-1).metrics.reopened.count, 0);
  assert.deepEqual(data.series.at(-1).metrics.reopened.items, []);
});
test('无法关联主表的来源日志不冒充其他模块，数量保持待验证', () => {
  const data = aggregateTransitions([log('recUnknown', 9999)], { now, bugRecords: [bug('recKeep', '蓝牙')] });
  const stat = data.series.at(-1).metrics.reopened;
  assert.equal(data.diagnostics.unmatchedSource, 1);
  assert.equal(stat.count, null);
  assert.equal(stat.quality, 'unmatched-module');
  assert.deepEqual(stat.items, []);
});
test('旧快照或不完整模块范围不能被识别为已过滤快照', () => {
  assert.equal(hasExpectedScope({}), false);
  assert.equal(hasExpectedScope({ scope: { version: 1, field: '功能模块', basedOn: 'current-bug-table', excludedModules: ['GFPS'] } }), false);
  assert.equal(hasExpectedScope({ scope: { version: 1, field: '功能模块', basedOn: 'current-bug-table', excludedModules: ['GFPS', 'LDAC'] } }), true);
});
