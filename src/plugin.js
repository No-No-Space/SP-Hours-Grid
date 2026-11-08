/*
 * Hours Grid, host side. The UI lives in index.html. This file only saves the
 * CSV the view produces: Super Productivity sandboxes plugin iframes without
 * `allow-downloads`, so the view posts the file here and this code saves it
 * from the app with PluginAPI.downloadFile.
 *
 * Nothing else runs here: no hooks, no timers, no network, no task access.
 */
const PLUGIN_ID = 'hours-grid';
const MSG_DOWNLOAD = 'HOURS_GRID_DOWNLOAD';
const MSG_ACK = 'HOURS_GRID_DOWNLOAD_ACK';
const MSG_RESULT = 'HOURS_GRID_DOWNLOAD_RESULT';
const MAX_EXPORT_CHARS = 10 * 1024 * 1024;
// timesheet_<from>_<to>[_<tags>].csv: letters, digits, _ . - only, so no paths.
const EXPORT_NAME_RE = /^[\w.-]{1,160}\.csv$/;

// Super Productivity renders plugin views with srcdoc and tags each iframe with
// data-plugin-id. The iframe is same-origin, so the sender's frameElement tells
// whether a message really came from this plugin's own view and not from
// another plugin's.
const isOwnView = (source) => {
  try {
    const frame = source && source.frameElement;
    return !!frame && frame.getAttribute('data-plugin-id') === PLUGIN_ID;
  } catch (e) {
    return false;
  }
};

const onMessage = async (event) => {
  const msg = event.data;
  if (!msg || msg.type !== MSG_DOWNLOAD || !isOwnView(event.source)) return;
  const reply = (ok, error) =>
    event.source.postMessage({ type: MSG_RESULT, requestId: msg.requestId, ok, error }, '*');
  if (typeof msg.data !== 'string' || msg.data.length > MAX_EXPORT_CHARS ||
      !EXPORT_NAME_RE.test(String(msg.filename))) {
    reply(false, 'Rejected export: bad file name or content');
    return;
  }
  // Received. Saving can take a while if the app asks where to save the file.
  event.source.postMessage({ type: MSG_ACK, requestId: msg.requestId }, '*');
  try {
    await PluginAPI.downloadFile(msg.filename, msg.data);
    reply(true);
  } catch (err) {
    console.error('[Hours Grid] CSV export failed', err);
    reply(false, String((err && err.message) || err));
  }
};

window.addEventListener('message', onMessage);

// plugin.js runs inside the app, so the listener would outlive a disabled or
// reloaded plugin unless it is removed.
if (typeof PluginAPI.onUnload === 'function') {
  PluginAPI.onUnload(() => window.removeEventListener('message', onMessage));
}
