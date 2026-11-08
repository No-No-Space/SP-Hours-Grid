# Changelog

All notable changes to this plugin. Versions follow the `version` in `src/manifest.json`.

## 0.4.0 — 2026-11-08

- **Renamed to Hours Grid**, id `hours-grid` (was *Timesheets*, `sp-timesheets`), so it is not confused with the *Timesheet* plugin already in the community list. Super Productivity sees it as a new plugin: uninstall the old one and set the settings again.
- **CSV export works inside Super Productivity.** Plugin iframes are sandboxed without downloads, so the old button did nothing in the app while still saying "Saved". The view now posts the CSV to a new `plugin.js`, which saves it with `PluginAPI.downloadFile` and reports back; the status line says "Saved" only after that, and shows an error otherwise.
- New permission: `downloadFile`, used only for the CSV.

## 0.3.0 — 2026-11-02

- Donut charts of hours per project, exact and rounded side by side, with a legend showing what rounding adds per project.
- Click a project in the donuts or the legend to see its tasks, exact and rounded; with *Project per day* rounding the project's rounding shows as one grey slice.
- Work time vs target: worked hours per day and per week against a target taken from Super Productivity's work start, work end and lunch break, with work days chosen in the plugin (Mon–Fri by default). Shows the plus or minus balance, the target so far for the current week and the hours left.
- **Edit time** mode: change a task's time for a day directly in the table (decimal hours, h:mm or minutes), add a task that has no time in the period, and undo changes. Saved to Super Productivity with `updateTask`; archived tasks are read-only.
- Status badge on every task: active (green ▶), done (amber ✓) or archived (grey archive icon), in the table and in the per-project donut legend.
- New permissions: `getAppState`, used only to read the schedule settings, and `updateTask`, used only to save edited time.

## 0.2.2 — 2026-11-01

First version submitted to the community list. (0.2.1 was tagged but never released.)

- `minSupVersion` set to 19.3.1, the version it has been tested on.
- README and tests use generic example names.

## 0.2.0 — 2026-11-01

- Tag filter: show only tasks carrying any of the selected tags; subtasks inherit their parent's tags.
- Tags shown next to each task and exported in a *Tags* column; CSV filename carries the selected tags.
- Reproducible ZIP builds and a `.sha256` file for the community listing.

## 0.1.0 — 2026-11-01

- First version: tasks grouped by project × days, configurable rounding (step, direction, scope), decimal or h:mm, copy to clipboard and CSV export, settings synced through Super Productivity.
