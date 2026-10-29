const { test } = require('node:test');
const assert = require('node:assert/strict');
const { focusProfile, findMacProfilePid } = require('../src/focus-profile');
const binary = '/Applications/Claude.app/Contents/MacOS/Claude';
const directory = '/Users/Test Name/Profiles/one';
test('selects only the requested account main process', () => {
  const output = `12 ${binary} --user-data-dir=${directory}-other\n13 ${binary} --user-data-dir=${directory}\n14 /Applications/Claude.app/Contents/Frameworks/Claude Helper --user-data-dir=${directory}`;
  assert.equal(findMacProfilePid(output, binary, directory), 13);
  assert.equal(findMacProfilePid(output, binary, '/absent'), null);
});
test('existing macOS profile is activated by PID without launching another Claude', async () => {
  const calls = [];
  const result = await focusProfile('darwin', '/Applications/Claude.app', directory, async (command, args) => {
    calls.push({command,args});
    return {stdout: command === '/bin/ps' ? `13 ${binary} --user-data-dir=${directory}` : 'true\n'};
  });
  assert.equal(result, true);
  assert.equal(calls.length, 2);
  assert.match(calls[1].args.at(-1), /ProcessIdentifier\(13\)/);
});
test('closed profile can be launched and activation failures do not start a duplicate', async () => {
  assert.equal(await focusProfile('darwin', '/Applications/Claude.app', directory, async () => ({stdout:''})), false);
  await assert.rejects(focusProfile('darwin', '/Applications/Claude.app', directory, async command => ({stdout:command === '/bin/ps' ? `13 ${binary} --user-data-dir=${directory}` : 'false'})), /trazer a janela/);
});
test('Windows distinguishes absent and existing accounts and quotes literal paths', async () => {
  for (const [stdout, expected] of [['absent', false], ['focused', true]]) {
    assert.equal(await focusProfile('win32', "C:\\O'Brien\\Claude.exe", "C:\\Profiles\\A & B", async (command, args) => {
      assert.equal(command, 'powershell.exe');
      assert.ok(args.at(-1).includes("'C:\\O''Brien\\Claude.exe'"));
      assert.ok(args.at(-1).includes('SetForegroundWindow'));
      return {stdout};
    }), expected);
  }
});
