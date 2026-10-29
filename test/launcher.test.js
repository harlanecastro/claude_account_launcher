const { test } = require('node:test');
const assert = require('node:assert/strict');
const { launchSpec, nativeDirectory, macProcesses } = require('../src/native-runtime');
test('opens the native macOS app without a relocated data directory or forced new instance', () => {
  assert.deepEqual(launchSpec('darwin', '/Applications/Claude.app'), { command: '/usr/bin/open', args: ['-a', '/Applications/Claude.app'] });
});
test('Windows launches with no data override', () => {
  assert.deepEqual(launchSpec('win32', 'C:\\Program Files\\Claude.exe'), { command: 'C:\\Program Files\\Claude.exe', args: [] });
});
test('native directory supports macOS, Windows and MSIX', () => {
  assert.equal(nativeDirectory('darwin','/Users/Test Name',{},''),'/Users/Test Name/Library/Application Support/Claude');
  assert.equal(nativeDirectory('win32','',{APPDATA:'C:\\Roaming'},'C:\\Claude.exe'),'C:\\Roaming\\Claude');
  assert.equal(nativeDirectory('win32','',{LOCALAPPDATA:'C:\\Local'},'C:\\Program Files\\WindowsApps\\Anthropic.Claude_1_x64__abc\\app\\Claude.exe'),'C:\\Local\\Packages\\Anthropic.Claude_abc\\LocalCache\\Roaming\\Claude');
});
test('only main Claude processes count, and legacy instances are distinguished', () => {
  const binary='/Applications/Claude.app/Contents/MacOS/Claude';
  assert.deepEqual(macProcesses(`10 ${binary}\n11 ${binary} --user-data-dir=/A B\n12 /Applications/Claude.app/Contents/Frameworks/Claude Helper`, '/Applications/Claude.app'), [{pid:10,relocated:false},{pid:11,relocated:true}]);
});
test('unsupported platforms fail explicitly', () => assert.throws(() => launchSpec('linux', ''), /macOS e Windows/));
