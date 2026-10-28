export const DISPLAY_START_DATE = '2026-10-28';

/** 只截取展示范围；保留原始日志快照与统计口径，不删除采集数据。 */
export function dashboardView(snapshot) {
  return {
    ...snapshot,
    startDate: DISPLAY_START_DATE,
    series: snapshot.series.filter(row => row.date >= DISPLAY_START_DATE),
  };
}

/** 柱和折线使用同一组每日转入数量，null 保持缺失而不伪装成 0。 */
export function mixedDatasets(metric, series) {
  const values = series.map(row => row.metrics[metric.key].count);
  return [
    {
      type: 'line', label: '变化趋势', data: [...values], order: 0,
      borderColor: metric.color, backgroundColor: metric.color,
      borderWidth: 2.5, pointRadius: series.length <= 30 ? 4 : 2,
      pointHoverRadius: 6, pointHitRadius: 12, pointBackgroundColor: '#ffffff',
      pointBorderColor: metric.color, pointBorderWidth: 2,
      tension: 0, fill: false, spanGaps: false,
    },
    {
      type: 'bar', label: '每日转入数量', data: [...values], order: 1,
      backgroundColor: metric.color + '99', hoverBackgroundColor: metric.color + 'cc',
      borderColor: metric.color + 'bb', borderWidth: 1,
      borderRadius: 5, maxBarThickness: 44, categoryPercentage: .7, barPercentage: .8,
    },
  ];
}
