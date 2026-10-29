const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { isAuthenticated } = require('../src/profile-session');

test('login status follows valid Claude session cookies, including WAL updates and logout', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'launcher-session-'));
  let db;
  try {
    assert.equal(isAuthenticated(directory), false);
    fs.mkdirSync(path.join(directory, 'Network'));
    db = new DatabaseSync(path.join(directory, 'Network', 'Cookies'));
    db.exec(`PRAGMA journal_mode=WAL; CREATE TABLE cookies
      (host_key TEXT, name TEXT, expires_utc INTEGER, encrypted_value BLOB, value TEXT)`);
    const insert = db.prepare('INSERT INTO cookies VALUES (?, ?, ?, ?, ?)');
    const now = Date.now();
    const expiry = (now / 1000 + 11644473600 + 3600) * 1000000;
    insert.run('.claude.ai', 'lastActiveOrg', expiry, Buffer.from('opaque'), '');
    insert.run('.example.com', 'sessionKey', expiry, Buffer.from('opaque'), '');
    insert.run('.claude.ai', 'sessionKey', expiry - 7200e6, Buffer.from('opaque'), '');
    assert.equal(isAuthenticated(directory, now), false);
    insert.run('.claude.ai', 'sessionKey', expiry, Buffer.from('opaque'), '');
    assert.equal(isAuthenticated(directory, now), true);
    assert.equal(isAuthenticated(directory, now + 7200000), false);
    db.exec("DELETE FROM cookies WHERE name = 'sessionKey'");
    assert.equal(isAuthenticated(directory, now), false);
    insert.run('claude.ai', 'sessionKeyV3', 0, Buffer.from('opaque'), '');
    assert.equal(isAuthenticated(directory, now), true);
    db.exec("DELETE FROM cookies; INSERT INTO cookies VALUES ('.claude.ai', 'sessionKey', 0, X'', '')");
    assert.equal(isAuthenticated(directory, now), false);
  } finally { db?.close(); fs.rmSync(directory, { recursive: true, force: true }); }
});
