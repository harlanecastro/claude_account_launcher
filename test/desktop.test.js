const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { restoreBounds, readState, writeState } = require('../src/window-state');
const { launchAgent, registerAutostart } = require('../src/autostart');
const screen = [{ x: 0, y: 0, width: 1440, height: 900 }];

test('restores saved dimensions and position', () => {
  const bounds = { x: 90, y: 60, width: 1120, height: 800 };
  assert.deepEqual(restoreBounds(bounds, screen), bounds);
});
test('disconnected monitor does not leave the window offscreen', () => {
  assert.deepEqual(restoreBounds({ x: 2500, y: 1200, width: 2000, height: 1200 }, screen), { x: 0, y: 0, width: 1440, height: 900 });
});
test('invalid state returns usable defaults and small work areas are respected', () => {
  assert.deepEqual(restoreBounds({ width: 'broken' }, screen), { x: 220, y: 75, width: 1000, height: 750 });
  assert.deepEqual(restoreBounds(null, [{ x: 0, y: 25, width: 640, height: 480 }]), { x: 0, y: 25, width: 640, height: 480 });
});
test('persists normal size and maximized state across reads', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'launcher-window-'));
  try {
    const file = path.join(temp, 'window-state.json');
    const state = { bounds: { x: 5, y: 30, width: 1050, height: 700 }, maximized: true };
    writeState(file, state);
    assert.deepEqual(readState(file), state);
  } finally { await fs.rm(temp, { recursive: true, force: true }); }
});
test('macOS autostart preserves literal paths and starts in the background', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'launcher-startup-'));
  const executable = '/Applications/A & B <C>/Launcher.app/Contents/MacOS/Launcher';
  try {
    await registerAutostart({ isPackaged: true, getPath: () => temp }, 'darwin', executable);
    const plist = await fs.readFile(path.join(temp, 'Library/LaunchAgents/com.claudeaccountlauncher.desktop.plist'), 'utf8');
    assert.equal(plist, launchAgent(executable));
    assert.match(plist, /A &amp; B &lt;C&gt;/);
    assert.match(plist, /<string>--background<\/string>/);
    assert.match(plist, /<key>RunAtLoad<\/key><true\/>/);
  } finally { await fs.rm(temp, { recursive: true, force: true }); }
});
test('does not register the development runtime as a login item', async () => {
  await registerAutostart({ isPackaged: false, setLoginItemSettings: () => assert.fail('must not register') }, 'win32');
});
test('rejects transient macOS app paths', async () => {
  await assert.rejects(registerAutostart({ isPackaged: true }, 'darwin', '/Volumes/Installer/App.app/Contents/MacOS/App'), /Aplicativos/);
});
test('Windows registers the installed executable with the background flag', async () => {
  let settings;
  await registerAutostart({ isPackaged: true, setLoginItemSettings: value => { settings = value; }, getLoginItemSettings: query => {
    assert.deepEqual(query, { path: 'C:\\Program Files\\Launcher.exe', args: ['--background'] });
    return { openAtLogin: true, executableWillLaunchAtLogin: true };
  } }, 'win32', 'C:\\Program Files\\Launcher.exe');
  assert.equal(settings.openAtLogin, true);
  assert.equal(settings.enabled, true);
  assert.deepEqual(settings.args, ['--background']);
});
test('Windows registration failure is reported', async () => {
  await assert.rejects(registerAutostart({ isPackaged: true, setLoginItemSettings: () => {}, getLoginItemSettings: () => ({openAtLogin:false}) }, 'win32'), /Windows não ativou/);
});
