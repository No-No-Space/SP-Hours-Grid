/*
 * Hours Grid — calculation core.
 * Pure functions, no DOM and no PluginAPI, so they can be unit-tested in Node
 * and inlined into index.html by the build script.
 */
(function (root) {
  'use strict';

  const MS_PER_MIN = 60 * 1000;
  const NO_PROJECT_ID = '__no_project__';
  /** Super Productivity's built-in "Today" tag is a planning list, not a category; never offered as a filter. */
  const SYSTEM_TAG_IDS = new Set(['TODAY']);

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
   * filter:   { tagIds: [] } — keep only tasks carrying at least one of these tags
   *           (own tags or the parent's, since subtasks often are not tagged themselves).
   *           Empty or missing = no filter.
   *
   * Only leaf tasks are counted. In Super Productivity a parent task's time is the
   * sum of its subtasks, so counting both would double the hours.
   */
  function buildTimesheet(tasks, projects, range, rounding = {}, filter = {}) {
    const { stepMinutes = 0, mode = 'up', scope = 'project-day' } = rounding;
    // Tasks the user added to the sheet to enter time: shown even with no time in the range.
    const include = new Set(filter.includeTaskIds || []);
    const days = dayKeys(range.from, range.to);
    const daySet = new Set(days);

    const byId = new Map();
    for (const t of tasks || []) if (t && t.id && !byId.has(t.id)) byId.set(t.id, t);

    const wanted = new Set((filter.tagIds || []).filter((id) => !SYSTEM_TAG_IDS.has(id)));
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
      if (!any && !include.has(t.id)) continue;

      const parent = t.parentId ? byId.get(t.parentId) : null;
      const tagIds = [...new Set([...(t.tagIds || []), ...((parent && parent.tagIds) || [])])].filter(
        (id) => !SYSTEM_TAG_IDS.has(id)
      );
      if (wanted.size && !tagIds.some((id) => wanted.has(id))) continue;
      const projectId = t.projectId || (parent && parent.projectId) || NO_PROJECT_ID;
      const title = parent ? `${parent.title} › ${t.title}` : t.title;

      if (!groups.has(projectId)) {
        groups.set(projectId, {
          id: projectId,
          title: projectId === NO_PROJECT_ID ? 'No project' : projectTitle.get(projectId) || projectId,
          rows: [],
        });
      }
      groups.get(projectId).rows.push({ taskId: t.id, title, tagIds, isDone: !!t.isDone, rawCells: cells });
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
    return { days, projects: out, dayTotals, grandTotal, rounding: { stepMinutes, mode, scope }, filter: { tagIds: [...wanted] } };
  }

  /**
   * Hours per project, exact and rounded side by side, for the donut charts.
   * exactSheet: the same timesheet built with stepMinutes 0. Largest exact share first.
   */
  function projectShares(roundedSheet, exactSheet) {
    const byId = new Map();
    for (const p of exactSheet.projects) byId.set(p.id, { id: p.id, title: p.title, exact: p.total, rounded: 0 });
    for (const p of roundedSheet.projects) {
      if (!byId.has(p.id)) byId.set(p.id, { id: p.id, title: p.title, exact: 0, rounded: 0 });
      byId.get(p.id).rounded = p.total;
    }
    return [...byId.values()].sort((a, b) => b.exact - a.exact || a.title.localeCompare(b.title));
  }

  /**
   * Hours per task inside one project, for drilling into a donut segment.
   *
   * With scope 'cell' every task has its own rounded hours (perTask: true).
   * With scope 'project-day' rounding applies to the project's daily total, so tasks
   * have no rounded hours of their own: `rounded` is null on each task and the
   * project's difference is reported once, as `rounding`.
   */
  function taskShares(roundedSheet, exactSheet, projectId) {
    const ep = exactSheet.projects.find((p) => p.id === projectId);
    const rp = roundedSheet.projects.find((p) => p.id === projectId);
    if (!ep && !rp) return null;
    const perTask = roundedSheet.rounding.scope === 'cell';
    const byId = new Map();
    for (const r of (ep && ep.rows) || []) byId.set(r.taskId, { id: r.taskId, title: r.title, isDone: r.isDone, exact: r.total, rounded: perTask ? 0 : null });
    if (perTask) {
      for (const r of (rp && rp.rows) || []) {
        if (!byId.has(r.taskId)) byId.set(r.taskId, { id: r.taskId, title: r.title, isDone: r.isDone, exact: 0, rounded: 0 });
        byId.get(r.taskId).rounded = r.total;
      }
    }
    const exact = ep ? ep.total : 0;
    const rounded = rp ? rp.total : 0;
    return {
      id: projectId,
      title: (ep || rp).title,
      perTask,
      exact,
      rounded,
      rounding: rounded - exact,
      tasks: [...byId.values()].sort((a, b) => b.exact - a.exact || a.title.localeCompare(b.title)),
    };
  }

  /** "9:00" / "17:30" → minutes after midnight; null if not a clock time. */
  function parseClock(s) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '').trim());
    if (!m) return null;
    const min = Number(m[1]) * 60 + Number(m[2]);
    return min >= 0 && min <= 24 * 60 ? min : null;
  }

  /**
   * Daily target from Super Productivity's Settings → Schedule:
   * work end − work start, minus the lunch break when that is enabled.
   * Returns ms, or null when work hours are not set.
   */
  function dailyTargetFromSchedule(schedule) {
    if (!schedule) return null;
    const start = parseClock(schedule.workStart);
    const end = parseClock(schedule.workEnd);
    if (start == null || end == null || end <= start) return null;
    let min = end - start;
    if (schedule.isLunchBreakEnabled) {
      const ls = parseClock(schedule.lunchBreakStart);
      const le = parseClock(schedule.lunchBreakEnd);
      // Only the part of the lunch break that falls inside the work day.
      if (ls != null && le != null && le > ls) min -= Math.max(0, Math.min(le, end) - Math.max(ls, start));
    }
    return min > 0 ? min * MS_PER_MIN : null;
  }

  /**
   * Worked time against the target, per day and per week.
   *
   * dayTotals: { 'YYYY-MM-DD': ms } for every day in the range
   * opts.dailyTargetMs: target for one work day
   * opts.workDays:      weekdays that are work days, 0 = Sunday … 6 = Saturday
   * opts.todayKey:      days after this have no target yet, so a week in progress
   *                     shows the balance so far, not against the whole week
   * opts.weekStartsOn:  1 = Monday
   *
   * Weeks are clipped to the range, so a month view starts and ends with partial weeks.
   */
  function workBalance(dayTotals, { dailyTargetMs = 8 * 60 * MS_PER_MIN, workDays = [1, 2, 3, 4, 5], todayKey = toDayKey(new Date()), weekStartsOn = 1 } = {}) {
    const work = new Set(workDays);
    const weeks = [];
    let week = null;
    for (const day of Object.keys(dayTotals).sort()) {
      const date = fromDayKey(day);
      const wr = weekRange(date, weekStartsOn);
      if (!week || week.weekFrom !== wr.from) {
        week = { weekFrom: wr.from, from: day, to: day, days: [], worked: 0, target: 0, targetToDate: 0 };
        weeks.push(week);
      }
      const target = work.has(date.getDay()) ? dailyTargetMs : 0;
      const counted = day <= todayKey;
      const worked = dayTotals[day] || 0;
      week.days.push({ day, worked, target, balance: counted ? worked - target : null, isFuture: !counted });
      week.to = day;
      week.worked += worked;
      week.target += target;
      if (counted) week.targetToDate += target;
    }
    for (const w of weeks) {
      w.balance = w.worked - w.targetToDate;
      w.remaining = Math.max(0, w.target - w.worked);
      w.isComplete = w.to <= todayKey;
      delete w.weekFrom;
    }
    const sum = (k) => weeks.reduce((s, w) => s + w[k], 0);
    return { weeks, worked: sum('worked'), target: sum('target'), targetToDate: sum('targetToDate'), balance: sum('balance') };
  }

  /**
   * Parse a typed duration into ms. Accepts decimal hours with comma or point ("1,5", "1.5"),
   * h:mm ("1:30"), and units ("90m", "90 min", "2h", "1h 30m"). Empty means zero.
   * Returns null for anything else, or for more than 24 h.
   */
  function parseDuration(input) {
    const s = String(input == null ? '' : input).trim().toLowerCase().replace(/\s+/g, ' ');
    if (s === '' || s === '-' || s === '–') return 0;
    let min = null;
    let m;
    if ((m = /^(\d{1,2}):([0-5]\d)$/.exec(s))) min = Number(m[1]) * 60 + Number(m[2]);
    else if ((m = /^(\d+(?:[.,]\d+)?|[.,]\d+) ?h?$/.exec(s))) min = Number(m[1].replace(',', '.')) * 60;
    else if ((m = /^(\d+) ?(?:m|min)$/.exec(s))) min = Number(m[1]);
    else if ((m = /^(\d+(?:[.,]\d+)?) ?h ?(\d+) ?(?:m|min)?$/.exec(s))) min = Number(m[1].replace(',', '.')) * 60 + Number(m[2]);
    if (min == null || !isFinite(min) || min > 24 * 60) return null;
    return Math.round(min) * MS_PER_MIN;
  }

  /** A task's timeSpentOnDay with one day set to `ms`; zero removes the day. Does not mutate. */
  function setDayTime(timeSpentOnDay, day, ms) {
    const out = { ...(timeSpentOnDay || {}) };
    if (ms > 0) out[day] = ms;
    else delete out[day];
    return out;
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

  /** Balance with an explicit sign, e.g. "+1.50", "−0:30", "±0". Uses a real minus sign. */
  function formatSigned(ms, { fmt = 'decimal', decimal = '.' } = {}) {
    const abs = Math.abs(ms);
    if (Math.round(abs / MS_PER_MIN) === 0) return '±0';
    const body = fmt === 'hm' ? formatHM(abs) : formatHours(abs, decimal);
    return (ms < 0 ? '−' : '+') + body;
  }

  function csvEscape(v, sep) {
    const s = String(v);
    return s.includes(sep) || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
  }

  /**
   * Delimited text export. Defaults suit Swedish Excel: ';' separator, ',' decimal.
   * Use sep '\t' for clipboard pasting into a spreadsheet.
   */
  function toDelimited(sheet, { sep = ';', decimal = ',', tagTitles = {} } = {}) {
    const f = (ms) => formatHours(ms, decimal, false);
    const tags = (ids) => (ids || []).map((id) => tagTitles[id] || id).join(', ');
    const lines = [];
    lines.push(['Project', 'Task', 'Tags', ...sheet.days, 'Total'].map((v) => csvEscape(v, sep)).join(sep));
    for (const p of sheet.projects) {
      for (const r of p.rows) {
        lines.push([p.title, r.title, tags(r.tagIds), ...sheet.days.map((d) => f(r.cells[d])), f(r.total)].map((v) => csvEscape(v, sep)).join(sep));
      }
      lines.push([p.title, 'Subtotal', '', ...sheet.days.map((d) => f(p.subtotal[d])), f(p.total)].map((v) => csvEscape(v, sep)).join(sep));
    }
    lines.push(['Total', '', '', ...sheet.days.map((d) => f(sheet.dayTotals[d])), f(sheet.grandTotal)].map((v) => csvEscape(v, sep)).join(sep));
    return lines.join('\r\n');
  }

  const api = {
    NO_PROJECT_ID,
    SYSTEM_TAG_IDS,
    toDayKey,
    fromDayKey,
    dayKeys,
    weekRange,
    monthRange,
    roundMs,
    buildTimesheet,
    projectShares,
    taskShares,
    parseClock,
    dailyTargetFromSchedule,
    workBalance,
    formatHours,
    formatHM,
    formatSigned,
    parseDuration,
    setDayTime,
    toDelimited,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TimesheetCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
