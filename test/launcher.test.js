const { test } = require('node:test');
const assert = require('node:assert/strict');
const { launchSpec } = require('../src/launcher');
test('macOS launches an independent instance and preserves spaces in paths', () => {
  assert.deepEqual(launchSpec('darwin', '/Applications/Claude.app', '/Users/Test Name/Profile One'), { command: '/usr/bin/open', args: ['-n', '-a', '/Applications/Claude.app', '--args', '--user-data-dir=/Users/Test Name/Profile One'] });
});
test('Windows passes directory as one literal argument without shell interpolation', () => {
  assert.deepEqual(launchSpec('win32', 'C:\\Program Files\\Claude.exe', 'C:\\Users\\A & B\\Profile'), { command: 'C:\\Program Files\\Claude.exe', args: ['--user-data-dir=C:\\Users\\A & B\\Profile'] });
});
test('unsupported platforms fail explicitly', () => assert.throws(() => launchSpec('linux', '', ''), /macOS e Windows/));
