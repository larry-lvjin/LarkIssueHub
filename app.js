'use strict';

const STATS_URL = './data/stats.json';

const COLOR = {
  total: '#8b5cf6',
  unresolved: '#ef4444',
  reopened: '#f59e0b',
  ratio: '#ec4899',
  newUnresolved: '#f97316',
  grid: '#eef0f4',
  tick: '#9ca3af',
};

const el = (id) => document.getElementById(id);
const charts = {};

function showError(message) {
  el('error').textContent = message;
  el('error').hidden = false;
}

function shortDate(iso) {
  return iso.slice(5); // MM-DD
}

function baseOptions(yTitle) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        backgroundColor: 'rgba(17,24,39,.92)',
        padding: 10,
        cornerRadius: 6,
        titleFont: { size: 12 },
        bodyFont: { size: 12 },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: {
          color: COLOR.tick,
          font: { size: 11 },
          maxRotation: 0,
          autoSkip: true,
          maxTicksLimit: 8,
        },
      },
      y: {
        beginAtZero: true,
        title: yTitle ? { display: true, text: yTitle, color: COLOR.tick, font: { size: 11 } } : undefined,
        grid: { color: COLOR.grid },
        ticks: { color: COLOR.tick, font: { size: 11 }, precision: 0 },
        border: { display: false },
      },
    },
  };
}

function lineDataset(label, data, color) {
  return {
    label,
    data,
    borderColor: color,
    backgroundColor: color + '22',
    borderWidth: 2,
    pointRadius: 0,
    pointHoverRadius: 4,
    tension: 0.25,
    fill: true,
  };
}

function draw(id, labels, datasets, yTitle, percentage = false) {
  if (charts[id]) charts[id].destroy();
  const options = baseOptions(yTitle);
  if (percentage) {
    options.scales.y.suggestedMax = 100;
    options.scales.y.ticks.callback = (v) => `${v}%`;
    options.plugins.tooltip.callbacks = {
      label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y}%`,
    };
  }
  charts[id] = new Chart(document.getElementById(id), {
    type: 'line',
    data: { labels, datasets },
    options,
  });
}

function renderCards(latest) {
  el('cTotal').textContent = latest.total.toLocaleString();
  el('cUnresolved').textContent = latest.unresolved.toLocaleString();
  el('cReopened').textContent = latest.reopened.toLocaleString();
  const ratio = latest.unresolved + latest.reopened;
  const pct = latest.total > 0 ? (ratio / latest.total) * 100 : 0;
  el('cRatio').textContent = `${pct.toFixed(1)}%`;
}

function renderCharts(series) {
  const labels = series.map((r) => shortDate(r.date));

  draw('chartTotal', labels, [lineDataset('总数', series.map((r) => r.total), COLOR.total)], '数量');

  draw('chartOpen', labels, [
    lineDataset('未解决', series.map((r) => r.unresolved), COLOR.unresolved),
    lineDataset('重新打开', series.map((r) => r.reopened), COLOR.reopened),
  ], '数量');

  draw(
    'chartRatio',
    labels,
    [lineDataset('未解决与重新打开占比', series.map((r) => r.ratio), COLOR.ratio)],
    '%',
    true,
  );

  draw('chartNew', labels, [
    lineDataset('每日新增未解决', series.map((r) => r.newUnresolved), COLOR.newUnresolved),
  ], '数量');
}

async function loadStats() {
  const btn = el('refresh');
  btn.disabled = true;
  el('error').hidden = true;

  if (typeof Chart === 'undefined') {
    showError('图表库加载失败（cdn.jsdelivr.net 无法访问），只能显示数字。请检查网络。');
    el('meta').textContent = '';
    btn.disabled = false;
    return;
  }

  try {
    const res = await fetch(STATS_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    if (!Array.isArray(data.series) || data.series.length === 0) {
      throw new Error('empty');
    }
    renderCards(data.latest);
    renderCharts(data.series);
    el('meta').textContent =
      `共 ${data.count} 天数据 · 截至 ${data.latest.date} · 生成于 ${new Date(data.generatedAt).toLocaleString('zh-CN')}`;
  } catch (error) {
    el('meta').textContent = '';
    if (error.message === 'empty') {
      showError('data/stats.json 里没有数据。');
    } else if (location.protocol === 'file:') {
      showError('直接打开本地文件时浏览器会拦截本地 JSON。请用 npm run serve 启动后再访问。');
    } else {
      showError('读不到 data/stats.json，请先执行 npm run stats 生成数据。');
    }
  } finally {
    btn.disabled = false;
  }
}

el('refresh').addEventListener('click', loadStats);
loadStats();
