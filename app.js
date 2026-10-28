import { QUALITY } from './lib/transitions.mjs';
const el = id => document.getElementById(id);
const charts = new Map();
let data;
let loading = false;
function node(tag, text, className) {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  if (className) n.className = className;
  return n;
}
function numberText(stat) {
  if (stat.count === null) return '—';
  return stat.items.map(item => item.bugNo || `序号缺失（${item.recordId}）`).join('、') || '无';
}
function summaryText(stat) {
  if (stat.count === null) return '—（暂无日志，未验证）';
  const numbers = numberText(stat);
  return stat.count === 0 ? '0（无）' : `${stat.count}（${numbers}）`;
}
function renderStock() {
  const stock = data.stock;
  const cards = el('cards');
  cards.replaceChildren();
  for (const item of [
    { label: '未解决 + 重新打开', value: stock.open, color: '#ef4444', hint: `未解决 ${stock.unresolved} + 重新打开 ${stock.reopened}` },
    { label: '待验收', value: stock.pending, color: '#8b5cf6', hint: '当前处于待验收状态的 Bug' },
  ]) {
    const card = node('article', undefined, 'card');
    card.style.setProperty('--metric-color', item.color);
    card.append(node('span', item.label, 'card-label'), node('strong', String(item.value), 'card-value'), node('span', item.hint, 'quality'));
    cards.append(card);
  }
  el('stockDate').textContent = stock.date + '（北京时间）';
  const at = new Date(stock.readAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
  el('stockMeta').textContent = `Bug 主表当前存量 · 读取于 ${at}（北京时间），不是当日转入数量。`;
}
function renderSelection() {
  const day = data.series.find(row => row.date === el('selectedDate').value);
  if (!day) return;
  for (const metric of data.metrics) {
    const stat = day.metrics[metric.key];
    const detail = el(`detail-${metric.key}`);
    detail.replaceChildren(node('strong', `${day.date} · ${metric.label}：${summaryText(stat)}`), node('span', QUALITY[stat.quality], 'quality'));
    if (stat.items.some(i => !i.bugNo || i.numberConflict)) detail.append(node('p', '注意：存在序号缺失或同一记录序号冲突；计数仍按来源记录 ID 去重。', 'warning'));
  }
}
function selectDay(date) {
  el('selectedDate').value = date;
  renderSelection();
}
function drawChart(metric) {
  charts.get(metric.key)?.destroy();
  const chart = new Chart(el(`chart-${metric.key}`), {
    type: 'line',
    data: {
      labels: data.series.map(row => row.date),
      datasets: [{ label: metric.label, data: data.series.map(row => row.metrics[metric.key].count), borderColor: metric.color, backgroundColor: metric.color + '18', borderWidth: 2, pointRadius: data.series.length <= 30 ? 4 : 2, pointHoverRadius: 6, pointHitRadius: 12, tension: 0, fill: true, spanGaps: false }],
    },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      interaction: { mode: 'index', intersect: false },
      onClick: (_event, active) => { if (active.length) selectDay(data.series[active[0].index].date); },
      plugins: {
        legend: { display: false },
        tooltip: { backgroundColor: '#111827', padding: 12, callbacks: {
          title: items => items.length ? data.series[items[0].dataIndex].date + '（北京时间）' : '',
          label: ctx => `${metric.label}：${summaryText(data.series[ctx.dataIndex].metrics[metric.key])}`,
          afterLabel: ctx => QUALITY[data.series[ctx.dataIndex].metrics[metric.key].quality],
        } },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#8a9099', maxTicksLimit: 8, maxRotation: 0, callback: function(value) { return this.getLabelForValue(value).slice(5); } } },
        y: { beginAtZero: true, suggestedMax: 1, border: { display: false }, title: { display: true, text: '转入数量', color: '#8a9099' }, grid: { color: '#eef0f4' }, ticks: { precision: 0, color: '#8a9099' } },
      },
    },
  });
  charts.set(metric.key, chart);
}
function renderTable(metric) {
  const body = el(`rows-${metric.key}`);
  body.replaceChildren();
  for (const day of [...data.series].reverse()) {
    const stat = day.metrics[metric.key];
    const row = node('tr');
    const date = node('td');
    const button = node('button', day.date, 'date-button');
    button.type = 'button';
    button.addEventListener('click', () => selectDay(day.date));
    date.append(button);
    const numbers = node('td', stat.count === null ? QUALITY[stat.quality] : numberText(stat));
    numbers.append(node('span', QUALITY[stat.quality], 'quality'));
    row.append(date, node('td', stat.count === null ? '—' : String(stat.count)), numbers);
    body.append(row);
  }
}
function showError(message) { el('error').textContent = message; el('error').hidden = false; }
async function loadStats() {
  if (loading) return;
  loading = true;
  el('refresh').disabled = true;
  el('error').hidden = true;
  try {
    const res = await fetch('./data/stats.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('missing');
    const next = await res.json();
    if (next.schemaVersion !== 2 || next.kind !== 'daily-incoming' || !next.series?.length || !next.stock) throw new Error('schema');
    data = next;
    renderStock();
    const selected = el('selectedDate').value;
    el('selectedDate').min = data.startDate;
    el('selectedDate').max = data.endDate;
    el('selectedDate').disabled = false;
    selectDay(data.series.some(d => d.date === selected) ? selected : data.endDate);
    for (const metric of data.metrics) renderTable(metric);
    if (typeof Chart === 'undefined') showError('图表库未加载；数量与序号已显示，请检查 CDN 网络后刷新。');
    else for (const metric of data.metrics) drawChart(metric);
    el('coverage').textContent = '采集开始：' + data.metrics.map(m => `${m.status} ${m.start.replace('T', ' ').replace('+08:00', '')}`).join('；') + '（北京时间）。首日仅部分时段；暂无有效日志、覆盖未验证的日期显示「—」，不冒充 0。';
    const when = new Date(data.generatedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
    el('meta').textContent = `日志统计 ${data.startDate} ～ ${data.endDate} · 取数于 ${when}（北京时间）`;
  } catch (error) {
    if (location.protocol === 'file:') showError('请用 npm run serve 启动页面，本地文件直开无法读取 JSON。');
    else if (error.message === 'schema') showError('本地数据还是旧版总量统计，请先执行 npm run stats 重新生成三种状态转入数据。');
    else showError('读取数据失败，请先执行 npm run stats，再刷新页面。');
  } finally { el('refresh').disabled = false; loading = false; }
}
el('selectedDate').addEventListener('change', renderSelection);
el('refresh').addEventListener('click', loadStats);
setInterval(() => { if (document.visibilityState === 'visible') loadStats(); }, 30000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') loadStats(); });
loadStats();
