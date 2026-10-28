import test from 'node:test';
import assert from 'node:assert/strict';
import { dashboardView, mixedDatasets, DISPLAY_START_DATE } from '../lib/chart-data.mjs';
const metric = { key: 'reopened', color: '#f59e0b' };
const day = (date, count) => ({ date, metrics: { reopened: { count, items: [] } } });
test('三个图表统一从10月28日起展示，不修改原始日志快照', () => {
  const snapshot = { startDate: '2026-10-27', stock: { open: 136, pending: 42 }, series: [day('2026-10-27', 1), day('2026-10-28', 2), day('2026-10-29', 3)] };
  const view = dashboardView(snapshot);
  assert.equal(DISPLAY_START_DATE, '2026-10-28');
  assert.equal(view.startDate, '2026-10-28');
  assert.deepEqual(view.series.map(row => row.date), ['2026-10-28', '2026-10-29']);
  assert.equal(snapshot.series.length, 3);
  assert.equal(snapshot.startDate, '2026-10-27');
  assert.equal(view.stock, snapshot.stock);
});
test('柱和折线显示同一天同一转入数量，不叠加、不做累计', () => {
  const datasets = mixedDatasets(metric, [day('2026-10-28', 2), day('2026-10-29', 1)]);
  assert.deepEqual(datasets.map(set => set.type), ['line', 'bar']);
  assert.deepEqual(datasets[0].data, [2, 1]);
  assert.deepEqual(datasets[1].data, [2, 1]);
  assert.ok(datasets[0].order < datasets[1].order, '折线绘制在柱前面');
});
test('未验证日期保留null，不能为了补柱或折线伪造为0', () => {
  const datasets = mixedDatasets(metric, [day('2026-10-28', null), day('2026-10-29', 0)]);
  for (const set of datasets) assert.deepEqual(set.data, [null, 0]);
  assert.equal(datasets[0].spanGaps, false);
});
