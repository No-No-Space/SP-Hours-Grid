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
