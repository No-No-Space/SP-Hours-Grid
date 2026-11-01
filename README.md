# SP-Timesheets

> Created: 2026-11-01 / by Aksel Alvarez Jurgueson & Claude
> Last updated: 2026-11-01 / by Claude
> Version: v0.2

A [Super Productivity](https://super-productivity.com) plugin that shows tracked time as a timesheet: **tasks grouped by project in rows, days in columns**, with a tag filter, configurable rounding and export to CSV or the clipboard.

It reads the per-day time Super Productivity already records on every task (`timeSpentOnDay`), so nothing extra has to be tracked.

![Timesheets: projects with daily subtotals, tasks below, days in columns, rounded to the hour](docs/screenshot.png)

## Features

- Week, month or custom date range; previous / next / today navigation. Weeks start on Monday.
- Project subtotal rows, task rows, a total column and a daily total row. Weekends are shaded.
- **Tag filter**: pick one or more tags (e.g. White, NoNoSpace, Personal) to show only tasks carrying any of them; none selected shows everything. A subtask counts as tagged if its parent is. Tag names appear next to each task and in a *Tags* column in the export, and the CSV filename carries the selected tags.
- Rounding: none, 15 min, 30 min or 1 hour; up, nearest or down.
- Rounding scope:
  - **Project per day** (default) — task rows show exact time; each project's daily total is rounded. Three 20-minute tasks on one day bill as 1 h.
  - **Each task per day** — every cell is rounded and subtotals are sums of rounded cells. The same three tasks bill as 3 h.
- Decimal hours (comma or point) or h:mm.
- **Copy** puts a tab-separated table on the clipboard (pastes straight into Excel); **CSV** saves a `;`-separated file with a UTF-8 BOM, which Swedish-locale Excel opens correctly.
- Settings are stored with `persistDataSynced`, so they follow Super Productivity's sync.
- Colours come from the theme variables Super Productivity injects into plugin iframes, so the table follows the app's theme.

### Counting rules

- Only **leaf tasks** are counted. A parent task's time in Super Productivity is the sum of its subtasks, so counting both would double the hours. Subtasks are shown as `Parent › Subtask`.
- Active and archived tasks are both read, so past weeks stay complete after tasks are archived.
- Tasks without a project are grouped under **No project**.
- Rounding is applied per day, never to the period total, and only to the tasks left after the tag filter.
- Super Productivity's built-in *Today* tag is a planning list, so it is never offered as a filter.

## Install

- **From the app** (once listed): **Settings → Plugins → Community Plugins → Timesheets → Install**.
- **By hand**: download `sp-timesheets-<version>.zip` from [Releases](https://github.com/No-No-Space/SP-Timesheets/releases) and upload it under **Settings → Plugins**.
- **From source**: `npm run build` (Node 18+, no dependencies) and upload `dist/sp-timesheets-<version>.zip`.

Then open **Timesheets** from the plugin menu.

## Privacy and permissions

The plugin is a single `index.html` running in Super Productivity's plugin iframe. It has no `plugin.js`, makes no network requests and does not use `nodeExecution`. It reads tasks (active and archived), projects and tags, and stores only its own settings with `persistDataSynced`. It never writes to your tasks.

## Develop

```
src/
  manifest.json        plugin manifest
  index.html           UI (loads the core with <script src>, inlined at build time)
  timesheet-core.js    pure calculation functions — aggregation, rounding, export
  icon.svg
test/core.test.js      node:test unit tests for the core
test/manifest.test.js  manifest checks the community listing relies on
scripts/build.mjs      inlines the core, writes dist/plugin/, the ZIP and its .sha256
scripts/listing-entry.mjs  prints the community-plugins.json entry
```

- `npm test` runs the unit tests.
- Opening `src/index.html` in a browser shows a preview with demo data (no `PluginAPI` present).
- Releases and the community listing: see [RELEASING.md](RELEASING.md). Changes: [CHANGELOG.md](CHANGELOG.md).
- Plugin API reference: [plugin-development.md](https://github.com/johannesjo/super-productivity/blob/master/docs/plugin-development.md).

## Roadmap

- Confirm the default rounding rule for White Arkitekter (project per day vs per entry).
- Filter by project; hide empty weekends.
- Optional Caribe theme for Super Productivity as a whole (the plugin inherits it automatically).

## Contributing

Issues and pull requests are welcome. Run `npm test` before opening a PR; the calculation logic lives in `src/timesheet-core.js` and should stay free of DOM and `PluginAPI` calls so it can be tested in Node.

## License

MIT
