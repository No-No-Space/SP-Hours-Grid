'use strict';
// plugin.js only relays the CSV from the plugin iframe to PluginAPI.downloadFile.
// These tests run it in a fake host window and check what it accepts and rejects.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const manifest = require('../src/manifest.json');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'src', 'plugin.js'), 'utf8');
const HTML = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.html'), 'utf8');

function host() {
  const listeners = [];
  const saved = [];
  let unload = null;
  const window = {
    addEventListener: (type, fn) => { if (type === 'message') listeners.push(fn); },
    removeEventListener: (type, fn) => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); },
  };
  const PluginAPI = {
    downloadFile: async (filename, data) => { saved.push({ filename, data }); },
    onUnload: (fn) => { unload = fn; },
  };
  vm.runInNewContext(SRC, { window, PluginAPI, console });
  const view = (pluginId) => {
    const replies = [];
    return {
      replies,
      frameElement: { getAttribute: (a) => (a === 'data-plugin-id' ? pluginId : null) },
      postMessage: (m) => replies.push(m),
    };
  };
  const send = async (source, data) => { for (const fn of [...listeners]) await fn({ source, data }); };
  return { listeners, saved, view, send, unload: () => unload && unload() };
}

const csv = (over = {}) => ({
  type: 'HOURS_GRID_DOWNLOAD', requestId: 'r1', filename: 'timesheet_2026-11-02_2026-11-08.csv', data: 'a;b\n', ...over,
});

test('PLUGIN_ID in plugin.js matches the manifest id', () => {
  assert.match(SRC, new RegExp(`const PLUGIN_ID = '${manifest.id}';`));
});

test('index.html and plugin.js use the same message types', () => {
  for (const t of ['HOURS_GRID_DOWNLOAD', 'HOURS_GRID_DOWNLOAD_ACK', 'HOURS_GRID_DOWNLOAD_RESULT']) {
    assert.ok(SRC.includes(`'${t}'`), `plugin.js: ${t}`);
    assert.ok(HTML.includes(`'${t}'`), `index.html: ${t}`);
  }
});

test('saves a CSV from its own view and replies ack then ok', async () => {
  const h = host();
  const v = h.view(manifest.id);
  await h.send(v, csv());
  assert.deepEqual(h.saved, [{ filename: 'timesheet_2026-11-02_2026-11-08.csv', data: 'a;b\n' }]);
  assert.deepEqual(v.replies.map((r) => r.type), ['HOURS_GRID_DOWNLOAD_ACK', 'HOURS_GRID_DOWNLOAD_RESULT']);
  assert.equal(v.replies[1].ok, true);
  assert.equal(v.replies[1].requestId, 'r1');
});

test('ignores messages from another plugin or a non-frame source', async () => {
  const h = host();
  const other = h.view('sp-timesheet');
  await h.send(other, csv());
  await h.send({ postMessage() {} }, csv());
  await h.send(null, csv());
  assert.equal(h.saved.length, 0);
  assert.equal(other.replies.length, 0);
});

test('ignores unrelated message types', async () => {
  const h = host();
  const v = h.view(manifest.id);
  await h.send(v, { type: 'SOMETHING_ELSE' });
  await h.send(v, null);
  assert.equal(h.saved.length, 0);
  assert.equal(v.replies.length, 0);
});

test('rejects bad file names and non-string or oversized content', async () => {
  const bad = [
    { filename: '../evil.csv' }, { filename: 'C:\\x.csv' }, { filename: 'a.exe' }, { filename: 'a.csv.exe' },
    { filename: '' }, { filename: undefined }, { data: 42 }, { data: 'x'.repeat(10 * 1024 * 1024 + 1) },
  ];
  for (const over of bad) {
    const h = host();
    const v = h.view(manifest.id);
    await h.send(v, csv(over));
    assert.equal(h.saved.length, 0, JSON.stringify(over).slice(0, 60));
    assert.equal(v.replies.length, 1);
    assert.equal(v.replies[0].ok, false);
  }
});

test('reports a failed save', async () => {
  const h = host();
  const v = h.view(manifest.id);
  // Replace downloadFile with one that fails, by rerunning with a failing API.
  const listeners = [];
  const window = { addEventListener: (t, fn) => listeners.push(fn), removeEventListener() {} };
  vm.runInNewContext(SRC, { window, console: { error() {} }, PluginAPI: { downloadFile: async () => { throw new Error('disk full'); } } });
  await listeners[0]({ source: v, data: csv() });
  assert.equal(v.replies.at(-1).ok, false);
  assert.match(v.replies.at(-1).error, /disk full/);
  assert.equal(h.saved.length, 0);
});

test('removes its listener on unload', () => {
  const h = host();
  assert.equal(h.listeners.length, 1);
  h.unload();
  assert.equal(h.listeners.length, 0);
});
