/*
 * SP-Timesheets — calculation core.
 * Pure functions, no DOM and no PluginAPI, so they can be unit-tested in Node
 * and inlined into index.html by the build script.
 */
(function (root) {
  'use strict';

  const MS_PER_MIN = 60 * 1000;
  const NO_PROJECT_ID = '__no_project__';

  /** Local-time YYYY-MM-DD, the same key format Super Productivity uses in timeSpentOnDay. */
  function toDayKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function fromDayKey(key) {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  /** Every day key from `from` to `to`, both inclusive. */
  function dayKeys(from, to) {
    const out = [];
    const cur = fromDayKey(from);
    const end = fromDayKey(to);
    while (cur <= end) {
      out.push(toDayKey(cur));
      cur.setDate(cur.getDate() + 1);
    }
    return out;
  }

  /** Week containing `date`. weekStartsOn: 1 = Monday (ISO, Sweden), 0 = Sunday. */
  function weekRange(date, weekStartsOn = 1) {
    const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diff = (start.getDay() - weekStartsOn + 7) % 7;
    start.setDate(start.getDate() - diff);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return { from: toDayKey(start), to: toDayKey(end) };
  }

  function monthRange(date) {
    const start = new Date(date.getFullYear(), date.getMonth(), 1);
    const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    return { from: toDayKey(start), to: toDayKey(end) };
  }

  /**
   * Round a duration.
   * stepMinutes: 0 (no rounding), 15, 30, 60 …
   * mode: 'up' | 'nearest' | 'down'
   * Zero stays zero in every mode: an empty cell is never billed.
   */
  function roundMs(ms, stepMinutes, mode = 'up') {
    if (!ms || !stepMinutes) return ms || 0;
    const step = stepMinutes * MS_PER_MIN;
    const q = ms / step;
    const fn = mode === 'down' ? Math.floor : mode === 'nearest' ? Math.round : Math.ceil;
    return fn(q) * step;
  }

  /**
   * Build the timesheet.
   *
   * tasks:    active + archived tasks (duplicates by id are ignored)
   * projects: [{ id, title }]
   * range:    { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' }
   * rounding: { stepMinutes, mode, scope }
   *   scope 'project-day' — task rows stay exact; each project's daily total is rounded.
   *   scope 'cell'        — every task × day cell is rounded; subtotals are sums of rounded cells.
   *
   * Only leaf tasks are counted. In Super Productivity a parent task's time is the
   * sum of its subtasks, so counting both would double the hours.
   */
  function buildTimesheet(tasks, projects, range, rounding = {}) {
    const { stepMinutes = 0, mode = 'up', scope = 'project-day' } = rounding;
    const days = dayKeys(range.from, range.to);
    const daySet = new Set(days);

    const byId = new Map();
    for (const t of tasks || []) if (t && t.id && !byId.has(t.id)) byId.set(t.id, t);

    const projectTitle = new Map((projects || []).map((p) => [p.id, p.title]));
    const groups = new Map();

    for (const t of byId.values()) {
      if (Array.isArray(t.subTaskIds) && t.subTaskIds.length > 0) continue;
      const spent = t.timeSpentOnDay || {};
      const cells = {};
      let any = false;
      for (const [day, ms] of Object.entries(spent)) {
        if (daySet.has(day) && ms > 0) {
          cells[day] = ms;
          any = true;
        }
      }
      if (!any) continue;

      const parent = t.parentId ? byId.get(t.parentId) : null;
      const projectId = t.projectId || (parent && parent.projectId) || NO_PROJECT_ID;
      const title = parent ? `${parent.title} › ${t.title}` : t.title;

      if (!groups.has(projectId)) {
        groups.set(projectId, {
          id: projectId,
          title: projectId === NO_PROJECT_ID ? 'No project' : projectTitle.get(projectId) || projectId,
          rows: [],
        });
      }
      groups.get(projectId).rows.push({ taskId: t.id, title, isDone: !!t.isDone, rawCells: cells });
    }

    const dayTotals = Object.fromEntries(days.map((d) => [d, 0]));
    const out = [];

    for (const g of groups.values()) {
      const subtotal = Object.fromEntries(days.map((d) => [d, 0]));
      for (const row of g.rows) {
        row.cells = {};
        row.total = 0;
        for (const d of days) {
          const raw = row.rawCells[d] || 0;
          const v = scope === 'cell' ? roundMs(raw, stepMinutes, mode) : raw;
          row.cells[d] = v;
          row.total += v;
          subtotal[d] += v;
        }
        delete row.rawCells;
      }
      if (scope !== 'cell') {
        for (const d of days) subtotal[d] = roundMs(subtotal[d], stepMinutes, mode);
      }
      let total = 0;
      for (const d of days) {
        total += subtotal[d];
        dayTotals[d] += subtotal[d];
      }
      g.rows.sort((a, b) => a.title.localeCompare(b.title));
      out.push({ ...g, subtotal, total });
    }

    out.sort((a, b) => a.title.localeCompare(b.title));
    const grandTotal = days.reduce((s, d) => s + dayTotals[d], 0);
    return { days, projects: out, dayTotals, grandTotal, rounding: { stepMinutes, mode, scope } };
  }

  /** Decimal hours, e.g. 5400000 → "1.50" (or "1,50"). Empty string for zero. */
  function formatHours(ms, decimal = '.', blankZero = true) {
    if (!ms && blankZero) return '';
    const s = (ms / 3600000).toFixed(2);
    return decimal === ',' ? s.replace('.', ',') : s;
  }

  /** h:mm, e.g. 5400000 → "1:30". Empty string for zero. */
  function formatHM(ms, blankZero = true) {
    if (!ms && blankZero) return '';
    const totalMin = Math.round(ms / MS_PER_MIN);
    return `${Math.floor(totalMin / 60)}:${String(totalMin % 60).padStart(2, '0')}`;
  }

  function csvEscape(v, sep) {
    const s = String(v);
    return s.includes(sep) || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
  }

  /**
   * Delimited text export. Defaults suit Swedish Excel: ';' separator, ',' decimal.
   * Use sep '\t' for clipboard pasting into a spreadsheet.
   */
  function toDelimited(sheet, { sep = ';', decimal = ',' } = {}) {
    const f = (ms) => formatHours(ms, decimal, false);
    const lines = [];
    lines.push(['Project', 'Task', ...sheet.days, 'Total'].map((v) => csvEscape(v, sep)).join(sep));
    for (const p of sheet.projects) {
      for (const r of p.rows) {
        lines.push([p.title, r.title, ...sheet.days.map((d) => f(r.cells[d])), f(r.total)].map((v) => csvEscape(v, sep)).join(sep));
      }
      lines.push([p.title, 'Subtotal', ...sheet.days.map((d) => f(p.subtotal[d])), f(p.total)].map((v) => csvEscape(v, sep)).join(sep));
    }
    lines.push(['Total', '', ...sheet.days.map((d) => f(sheet.dayTotals[d])), f(sheet.grandTotal)].map((v) => csvEscape(v, sep)).join(sep));
    return lines.join('\r\n');
  }

  const api = {
    NO_PROJECT_ID,
    toDayKey,
    fromDayKey,
    dayKeys,
    weekRange,
    monthRange,
    roundMs,
    buildTimesheet,
    formatHours,
    formatHM,
    toDelimited,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TimesheetCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
