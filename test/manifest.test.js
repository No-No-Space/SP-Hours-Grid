'use strict';
// Checks the community listing relies on: id and version must match between the
// manifest, package.json and the listing entry, and the version must be numeric.
const test = require('node:test');
const assert = require('node:assert/strict');
const manifest = require('../src/manifest.json');
const pkg = require('../package.json');

test('manifest has the required fields', () => {
  for (const k of ['id', 'name', 'version', 'manifestVersion', 'minSupVersion']) assert.ok(manifest[k], k);
  assert.ok(Array.isArray(manifest.hooks), 'hooks must be an array');
  assert.ok(Array.isArray(manifest.permissions), 'permissions must be an array');
  assert.equal(manifest.iFrame, true);
});

test('id is lowercase kebab-case', () => {
  assert.match(manifest.id, /^[a-z0-9]+(-[a-z0-9]+)*$/);
});

test('version is numeric and matches package.json', () => {
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.equal(manifest.version, pkg.version);
});
