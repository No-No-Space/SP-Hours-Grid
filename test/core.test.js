'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/timesheet-core.js');

const MIN = 60 * 1000;
const H = 60 * MIN;

const projects = [
  { id: 'p1', title: 'Office — Hospital' },
  { id: 'p2', title: 'Freelance' },
];

// Tags: a = Office, b = Office + Today, c = untagged; parent 'parent' = Freelance (subtask inherits).
// Three 20-minute tasks on the same day in one project: the case that shows why scope matters.
const tasks = [
  { id: 'a', title: 'Clash check', projectId: 'p1', tagIds: ['office'], subTaskIds: [], timeSpentOnDay: { '2026-11-02': 20 * MIN } },
  { id: 'b', title: 'IFC export', projectId: 'p1', tagIds: ['office', 'TODAY'], subTaskIds: [], timeSpentOnDay: { '2026-11-02': 20 * MIN } },
  { id: 'c', title: 'Model QA', projectId: 'p1', subTaskIds: [], timeSpentOnDay: { '2026-11-02': 20 * MIN, '2026-11-03': 70 * MIN } },
  // Parent with a subtask: only the subtask may be counted.
  { id: 'parent', title: 'Website', projectId: 'p2', tagIds: ['freelance'], subTaskIds: ['sub'], timeSpentOnDay: { '2026-11-02': 45 * MIN } },
  { id: 'sub', title: 'Fonts', projectId: 'p2', parentId: 'parent', subTaskIds: [], timeSpentOnDay: { '2026-11-02': 45 * MIN } },
  // Outside the range: must not appear.
  { id: 'old', title: 'Old', projectId: 'p2', subTaskIds: [], timeSpentOnDay: { '2026-10-01': 2 * H } },
  // No project.
  { id: 'np', title: 'Admin', projectId: null, subTaskIds: [], timeSpentOnDay: { '2026-11-04': 10 * MIN } },
];

const range = { from: '2026-11-02', to: '2026-11-08' };

test('dayKeys is inclusive and crosses month ends', () => {
  assert.deepEqual(C.dayKeys('2026-10-30', '2026-11-02'), ['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
});

test('weekRange starts on Monday', () => {
  assert.deepEqual(C.weekRange(new Date(2026, 10, 1)), { from: '2026-10-26', to: '2026-11-01' }); // Sunday
  assert.deepEqual(C.weekRange(new Date(2026, 10, 2)), { from: '2026-11-02', to: '2026-11-08' }); // Monday
});

test('monthRange', () => {
  assert.deepEqual(C.monthRange(new Date(2026, 1, 10)), { from: '2026-02-01', to: '2026-02-28' });
});

test('roundMs modes', () => {
  assert.equal(C.roundMs(20 * MIN, 60, 'up'), H);
  assert.equal(C.roundMs(20 * MIN, 60, 'down'), 0);
  assert.equal(C.roundMs(31 * MIN, 60, 'nearest'), H);
  assert.equal(C.roundMs(70 * MIN, 30, 'up'), 90 * MIN);
  assert.equal(C.roundMs(0, 60, 'up'), 0);
  assert.equal(C.roundMs(17 * MIN, 0, 'up'), 17 * MIN);
});

test('scope project-day rounds the project total per day, not each task', () => {
  const s = C.buildTimesheet(tasks, projects, range, { stepMinutes: 60, mode: 'up', scope: 'project-day' });
  const p1 = s.projects.find((p) => p.id === 'p1');
  assert.equal(p1.subtotal['2026-11-02'], H); // 60 min exact → 1 h
  assert.equal(p1.subtotal['2026-11-03'], 2 * H); // 70 min → 2 h
  assert.equal(p1.total, 3 * H);
  // Task rows stay exact.
  assert.equal(p1.rows.find((r) => r.taskId === 'a').cells['2026-11-02'], 20 * MIN);
});

test('scope cell rounds every cell', () => {
  const s = C.buildTimesheet(tasks, projects, range, { stepMinutes: 60, mode: 'up', scope: 'cell' });
  const p1 = s.projects.find((p) => p.id === 'p1');
  assert.equal(p1.subtotal['2026-11-02'], 3 * H); // 3 × 20 min → 3 × 1 h
});

test('parents are skipped and subtasks carry the parent title and project', () => {
  const s = C.buildTimesheet(tasks, projects, range, {});
  const p2 = s.projects.find((p) => p.id === 'p2');
  assert.equal(p2.rows.length, 1);
  assert.equal(p2.rows[0].title, 'Website › Fonts');
  assert.equal(p2.total, 45 * MIN);
});

test('out-of-range tasks are dropped, tasks without project are grouped', () => {
  const s = C.buildTimesheet(tasks, projects, range, {});
  const ids = s.projects.flatMap((p) => p.rows.map((r) => r.taskId));
  assert.ok(!ids.includes('old'));
  assert.ok(s.projects.some((p) => p.id === C.NO_PROJECT_ID && p.title === 'No project'));
});

test('duplicates (active + archived) are counted once', () => {
  const s = C.buildTimesheet([...tasks, tasks[0]], projects, range, {});
  assert.equal(s.projects.find((p) => p.id === 'p1').rows.length, 3);
});

test('grand total equals the sum of day totals', () => {
  const s = C.buildTimesheet(tasks, projects, range, { stepMinutes: 30, mode: 'up' });
  const sum = Object.values(s.dayTotals).reduce((a, b) => a + b, 0);
  assert.equal(s.grandTotal, sum);
});

test('formatting', () => {
  assert.equal(C.formatHours(90 * MIN), '1.50');
  assert.equal(C.formatHours(90 * MIN, ','), '1,50');
  assert.equal(C.formatHours(0), '');
  assert.equal(C.formatHM(90 * MIN), '1:30');
});

test('delimited export has header, rows, subtotals and total', () => {
  const s = C.buildTimesheet(tasks, projects, range, { stepMinutes: 60, mode: 'up' });
  const lines = C.toDelimited(s).split('\r\n');
  assert.equal(lines[0].split(';').length, 3 + 7 + 1);
  assert.ok(lines.some((l) => l.startsWith('Office — Hospital;Subtotal;')));
  assert.ok(lines[lines.length - 1].startsWith('Total;'));
});

test('tag filter keeps tasks with any selected tag, inheriting parent tags', () => {
  const office = C.buildTimesheet(tasks, projects, range, {}, { tagIds: ['office'] });
  assert.deepEqual(office.projects.flatMap((p) => p.rows.map((r) => r.taskId)).sort(), ['a', 'b']);
  const freelance = C.buildTimesheet(tasks, projects, range, {}, { tagIds: ['freelance'] });
  assert.deepEqual(freelance.projects.flatMap((p) => p.rows.map((r) => r.taskId)), ['sub']);
  const both = C.buildTimesheet(tasks, projects, range, {}, { tagIds: ['office', 'freelance'] });
  assert.equal(both.projects.flatMap((p) => p.rows).length, 3);
});

test('rounding applies to the filtered set only', () => {
  // Office on 2 Nov: a + b = 40 min → 1 h; untagged c is excluded.
  const s = C.buildTimesheet(tasks, projects, range, { stepMinutes: 60, mode: 'up' }, { tagIds: ['office'] });
  assert.equal(s.projects.find((p) => p.id === 'p1').subtotal['2026-11-02'], H);
  assert.equal(s.grandTotal, H);
});

test('the Today tag is neither a filter nor shown on rows', () => {
  const onlyToday = C.buildTimesheet(tasks, projects, range, {}, { tagIds: ['TODAY'] });
  assert.equal(onlyToday.projects.flatMap((p) => p.rows).length, 5); // treated as no filter
  const row = onlyToday.projects.flatMap((p) => p.rows).find((r) => r.taskId === 'b');
  assert.deepEqual(row.tagIds, ['office']);
});

test('export has a Tags column with titles', () => {
  const s = C.buildTimesheet(tasks, projects, range, {}, { tagIds: ['office'] });
  const lines = C.toDelimited(s, { tagTitles: { office: 'Office' } }).split('\r\n');
  assert.ok(lines.some((l) => l.startsWith('Office — Hospital;Clash check;Office;')));
});

test('projectShares pairs exact and rounded totals per project, largest first', () => {
  const r = C.buildTimesheet(tasks, projects, range, { stepMinutes: 60, mode: 'up' });
  const e = C.buildTimesheet(tasks, projects, range, { stepMinutes: 0 });
  const shares = C.projectShares(r, e);
  assert.equal(shares[0].id, 'p1');
  assert.deepEqual({ exact: shares[0].exact, rounded: shares[0].rounded }, { exact: 130 * MIN, rounded: 3 * H });
  assert.equal(shares.reduce((s, x) => s + x.exact, 0), e.grandTotal);
  assert.equal(shares.reduce((s, x) => s + x.rounded, 0), r.grandTotal);
});

test('daily target from the schedule subtracts the lunch break', () => {
  const s = { workStart: '8:00', workEnd: '17:00', isLunchBreakEnabled: true, lunchBreakStart: '12:00', lunchBreakEnd: '13:00' };
  assert.equal(C.dailyTargetFromSchedule(s), 8 * H);
  assert.equal(C.dailyTargetFromSchedule({ ...s, isLunchBreakEnabled: false }), 9 * H);
  assert.equal(C.dailyTargetFromSchedule({ ...s, lunchBreakStart: '16:30', lunchBreakEnd: '18:00' }), 8.5 * H); // clipped to the work day
  assert.equal(C.dailyTargetFromSchedule({ workStart: '', workEnd: '17:00' }), null);
  assert.equal(C.dailyTargetFromSchedule(null), null);
});

test('workBalance: full week against 5 × 8 h', () => {
  const totals = Object.fromEntries(C.dayKeys('2026-11-02', '2026-11-08').map((d) => [d, 0]));
  Object.assign(totals, { '2026-11-02': 9 * H, '2026-11-03': 8 * H, '2026-11-04': 7.5 * H, '2026-11-05': 8 * H, '2026-11-06': 6 * H, '2026-11-07': 2 * H });
  const b = C.workBalance(totals, { dailyTargetMs: 8 * H, todayKey: '2026-11-30' });
  assert.equal(b.weeks.length, 1);
  const w = b.weeks[0];
  assert.equal(w.target, 40 * H);
  assert.equal(w.worked, 40.5 * H);
  assert.equal(w.balance, 0.5 * H);
  assert.ok(w.isComplete);
  assert.equal(w.days[5].target, 0); // Saturday
  assert.equal(w.days[5].balance, 2 * H);
});

test('workBalance: a week in progress counts the target up to today only', () => {
  const totals = Object.fromEntries(C.dayKeys('2026-11-02', '2026-11-08').map((d) => [d, 0]));
  Object.assign(totals, { '2026-11-02': 8 * H, '2026-11-03': 7 * H });
  const w = C.workBalance(totals, { dailyTargetMs: 8 * H, todayKey: '2026-11-03' }).weeks[0];
  assert.equal(w.targetToDate, 16 * H);
  assert.equal(w.balance, -1 * H);
  assert.equal(w.remaining, 25 * H);
  assert.equal(w.days[2].balance, null);
  assert.ok(!w.isComplete);
});

test('workBalance splits a month into weeks clipped to the range', () => {
  const totals = Object.fromEntries(C.dayKeys('2026-11-01', '2026-11-30').map((d) => [d, 0]));
  const b = C.workBalance(totals, { dailyTargetMs: 8 * H, todayKey: '2026-12-31' });
  assert.deepEqual(b.weeks.map((w) => [w.from, w.to]), [
    ['2026-11-01', '2026-11-01'], ['2026-11-02', '2026-11-08'], ['2026-11-09', '2026-11-15'],
    ['2026-11-16', '2026-11-22'], ['2026-11-23', '2026-11-29'], ['2026-11-30', '2026-11-30'],
  ]);
  assert.equal(b.weeks[0].target, 0); // Sunday 1 Nov
  assert.equal(b.target, 21 * 8 * H);
  assert.equal(b.balance, -21 * 8 * H);
});

test('formatSigned', () => {
  assert.equal(C.formatSigned(90 * MIN), '+1.50');
  assert.equal(C.formatSigned(-30 * MIN, { fmt: 'hm' }), '−0:30');
  assert.equal(C.formatSigned(-90 * MIN, { decimal: ',' }), '−1,50');
  assert.equal(C.formatSigned(0), '±0');
});

test('taskShares, project-day scope: tasks exact, rounding reported once for the project', () => {
  const r = C.buildTimesheet(tasks, projects, range, { stepMinutes: 60, mode: 'up', scope: 'project-day' });
  const e = C.buildTimesheet(tasks, projects, range, { stepMinutes: 0 });
  const t = C.taskShares(r, e, 'p1');
  assert.equal(t.perTask, false);
  assert.deepEqual(t.tasks.map((x) => x.id), ['c', 'a', 'b']); // largest first, then by title
  assert.equal(t.tasks[0].exact, 90 * MIN);
  assert.equal(t.tasks[0].rounded, null);
  assert.equal(t.exact, 130 * MIN);
  assert.equal(t.rounded, 3 * H);
  assert.equal(t.rounding, 50 * MIN);
});

test('taskShares, cell scope: every task has its own rounded hours', () => {
  const r = C.buildTimesheet(tasks, projects, range, { stepMinutes: 60, mode: 'up', scope: 'cell' });
  const e = C.buildTimesheet(tasks, projects, range, { stepMinutes: 0 });
  const t = C.taskShares(r, e, 'p1');
  assert.equal(t.perTask, true);
  assert.equal(t.tasks.find((x) => x.id === 'c').rounded, 3 * H); // 20 min → 1 h, 70 min → 2 h
  assert.equal(t.tasks.reduce((s, x) => s + x.rounded, 0), t.rounded);
  assert.equal(C.taskShares(r, e, 'nope'), null);
});

test('parseDuration accepts decimal hours, h:mm and units', () => {
  assert.equal(C.parseDuration('1,5'), 90 * MIN);
  assert.equal(C.parseDuration('1.5'), 90 * MIN);
  assert.equal(C.parseDuration(',25'), 15 * MIN);
  assert.equal(C.parseDuration('2'), 2 * H);
  assert.equal(C.parseDuration('2h'), 2 * H);
  assert.equal(C.parseDuration('1:30'), 90 * MIN);
  assert.equal(C.parseDuration('45m'), 45 * MIN);
  assert.equal(C.parseDuration('45 min'), 45 * MIN);
  assert.equal(C.parseDuration('1h 30m'), 90 * MIN);
  assert.equal(C.parseDuration(''), 0);
  assert.equal(C.parseDuration('0'), 0);
  assert.equal(C.parseDuration('abc'), null);
  assert.equal(C.parseDuration('-1'), null);
  assert.equal(C.parseDuration('25'), null); // more than a day
  assert.equal(C.parseDuration('1:75'), null);
});

test('setDayTime sets or removes one day without mutating', () => {
  const orig = { '2026-11-02': H };
  assert.deepEqual(C.setDayTime(orig, '2026-11-03', 30 * MIN), { '2026-11-02': H, '2026-11-03': 30 * MIN });
  assert.deepEqual(C.setDayTime(orig, '2026-11-02', 0), {});
  assert.deepEqual(orig, { '2026-11-02': H });
  assert.deepEqual(C.setDayTime(undefined, '2026-11-02', H), { '2026-11-02': H });
});

test('includeTaskIds shows a task with no time in the range, still honouring the tag filter', () => {
  const s = C.buildTimesheet(tasks, projects, range, {}, { includeTaskIds: ['old'] });
  const row = s.projects.find((p) => p.id === 'p2').rows.find((r) => r.taskId === 'old');
  assert.ok(row);
  assert.equal(row.total, 0);
  const filtered = C.buildTimesheet(tasks, projects, range, {}, { includeTaskIds: ['old'], tagIds: ['office'] });
  assert.ok(!filtered.projects.flatMap((p) => p.rows).some((r) => r.taskId === 'old'));
});
