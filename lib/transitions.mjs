export const METRICS = Object.freeze([
  { key: 'reopened', status: '重新打开', label: '重新打开变化', color: '#f59e0b', start: '2026-10-27T23:09:42+08:00' },
  { key: 'unresolved', status: '未解决', label: '未解决变化', color: '#ef4444', start: '2026-10-27T23:09:58+08:00' },
  { key: 'pending', status: '待验收', label: '待验收变化', color: '#8b5cf6', start: '2026-10-27T23:09:35+08:00' },
]);
const DAY = 86400000;
const OFFSET = 8 * 3600000;
export const dateKey = ms => new Date(ms + OFFSET).toISOString().slice(0, 10);
export function cellText(value) {
  if (value == null) return '';
  if (Array.isArray(value)) return value.map(cellText).join('');
  if (typeof value === 'object') return cellText(value.text ?? value.value ?? '');
  return String(value).trim();
}
function validDay(day) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const ms = Date.parse(`${day}T00:00:00Z`);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === day;
}
export function timestamp(value) {
  if (Array.isArray(value) || typeof value === 'object') value = cellText(value);
  if (typeof value === 'number' || /^\d{13}$/.test(value || '')) {
    const n = Number(value);
    return n >= 946656000000 && n < 7258089600000 ? n : null;
  }
  const match = /^(\d{4})[-/](\d{2})[-/](\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(\.\d{1,3})?)?(Z|[+-]\d{2}:?\d{2})?$/.exec(cellText(value));
  if (!match) return null;
  const [, y, mo, d, h, mi, s = '00', frac = '', tz = '+08:00'] = match;
  if (!validDay(`${y}-${mo}-${d}`) || +h > 23 || +mi > 59 || +s > 59) return null;
  const ms = Date.parse(`${y}-${mo}-${d}T${h}:${mi}:${s}${frac}${tz}`);
  return Number.isFinite(ms) ? ms : null;
}
export const QUALITY = Object.freeze({
  partial: '首日部分时段', today: '今日截至取数时', observed: '按已读取日志',
  unverified: '暂无有效日志，覆盖待验证', 'not-covered': '尚未启用采集',
});

export function currentStock(records, now = Date.now()) {
  const counts = { total: records.length, unresolved: 0, reopened: 0, pending: 0, emptyStatus: 0 };
  for (const row of records) {
    const status = cellText(row.fields?.['问题状态']);
    if (!status) counts.emptyStatus++;
    if (status === '未解决') counts.unresolved++;
    if (status === '重新打开') counts.reopened++;
    if (status === '待验收') counts.pending++;
  }
  return { ...counts, open: counts.unresolved + counts.reopened, date: dateKey(now), readAt: new Date(now).toISOString() };
}

/** 转入计数 = 日期(北京时间) × 目标状态 × 来源记录 ID 去重。不是库存，也不是日净增减。 */
export function aggregateTransitions(records, { now = Date.now(), metrics = METRICS } = {}) {
  const buckets = new Map();
  const firstSeen = new Map();
  const diagnostics = { rows: records.length, blank: 0, otherStatus: 0, invalidId: 0, invalidTime: 0, beforeStart: 0, future: 0, accepted: 0, duplicate: 0, missingNumber: 0, numberConflicts: 0 };
  for (const row of records) {
    const f = row.fields || {};
    const recordId = cellText(f['记录ID']);
    if (!recordId) { diagnostics.blank++; continue; }
    const metric = metrics.find(m => m.status === cellText(f['目标状态']));
    if (!metric) { diagnostics.otherStatus++; continue; }
    if (!/^rec[a-zA-Z0-9]+$/.test(recordId)) { diagnostics.invalidId++; continue; }
    const at = timestamp(f['变更时间']);
    if (at === null) { diagnostics.invalidTime++; continue; }
    if (at < Date.parse(metric.start)) { diagnostics.beforeStart++; continue; }
    if (at > now) { diagnostics.future++; continue; }
    diagnostics.accepted++;
    firstSeen.set(metric.key, Math.min(firstSeen.get(metric.key) ?? Infinity, at));
    const bucketKey = `${dateKey(at)}|${metric.key}`;
    if (!buckets.has(bucketKey)) buckets.set(bucketKey, new Map());
    const bucket = buckets.get(bucketKey);
    const bugNo = cellText(f['Bug编号']);
    let item = bucket.get(recordId);
    if (item) {
      diagnostics.duplicate++;
      item.logCount++;
      item.firstAt = Math.min(item.firstAt, at);
      item.lastAt = Math.max(item.lastAt, at);
    } else {
      item = { recordId, bugNumbers: new Set(), firstAt: at, lastAt: at, logCount: 1 };
      bucket.set(recordId, item);
    }
    if (bugNo) item.bugNumbers.add(bugNo);
  }
  const startDate = metrics.map(m => dateKey(Date.parse(m.start))).sort()[0];
  const endDate = dateKey(now);
  const series = [];
  for (let ms = Date.parse(`${startDate}T00:00:00+08:00`); ms <= now; ms += DAY) {
    const date = dateKey(ms);
    const daily = { date, metrics: {} };
    for (const metric of metrics) {
      const items = [...(buckets.get(`${date}|${metric.key}`)?.values() ?? [])].map(item => {
        const bugNumbers = [...item.bugNumbers].sort((a, b) => a.localeCompare(b, 'zh-CN', { numeric: true }));
        if (!bugNumbers.length) diagnostics.missingNumber++;
        if (bugNumbers.length > 1) diagnostics.numberConflicts++;
        return { ...item, bugNumbers, bugNo: bugNumbers.join(' / ') || '', numberConflict: bugNumbers.length > 1 };
      }).sort((a, b) => (a.bugNo || a.recordId).localeCompare(b.bugNo || b.recordId, 'zh-CN', { numeric: true }));
      const since = dateKey(Date.parse(metric.start));
      let quality;
      if (date < since || now < Date.parse(metric.start)) quality = 'not-covered';
      else if (!firstSeen.has(metric.key) || date < dateKey(firstSeen.get(metric.key))) quality = 'unverified';
      else if (date === since) quality = 'partial';
      else quality = date === endDate ? 'today' : 'observed';
      const known = ['partial', 'today', 'observed'].includes(quality);
      daily.metrics[metric.key] = { count: known ? items.length : null, quality, items };
    }
    series.push(daily);
  }
  return { schemaVersion: 2, kind: 'daily-incoming', timeZone: 'Asia/Shanghai', generatedAt: new Date(now).toISOString(), startDate, endDate, metrics, series, diagnostics };
}
