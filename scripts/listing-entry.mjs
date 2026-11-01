// Print the entry for Super Productivity's src/assets/community-plugins.json.
//   npm run build && npm run listing
// The sha256 is taken from the ZIP in dist/, so run this against the same file that is
// attached to the GitHub release (CI does exactly that). See RELEASING.md.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(root, 'src', 'manifest.json'), 'utf8'));
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

const repo = pkg.repository.url.replace(/^git\+/, '').replace(/\.git$/, '');
const zipName = `sp-timesheets-${manifest.version}.zip`;
const sha256 = createHash('sha256').update(readFileSync(join(root, 'dist', zipName))).digest('hex');

const entry = {
  name: 'Timesheets',
  shortDescription:
    'Timesheet table of tracked time: tasks grouped by project × days, tag filter, rounding to 15/30/60 min, CSV export.',
  url: repo,
  author: pkg.author.name,
  authorUrl: pkg.author.url,
  stars: 0,
  id: manifest.id,
  release: {
    version: manifest.version,
    downloadUrl: `${repo}/releases/download/v${manifest.version}/${zipName}`,
    sha256,
  },
};
console.log(JSON.stringify(entry, null, 2));
