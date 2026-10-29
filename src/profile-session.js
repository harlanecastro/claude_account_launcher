const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');

// Inspect only cookie metadata; credentials remain encrypted in Claude's store.
function isAuthenticated(directory, now = Date.now()) {
  const chromiumTime = (now / 1000 + 11644473600) * 1000000;
  for (const relative of ['Cookies', path.join('Network', 'Cookies')]) {
    const file = path.join(directory, relative);
    if (!fs.existsSync(file)) continue;
    const db = new DatabaseSync(file, { readOnly: true });
    try {
      db.exec('PRAGMA busy_timeout = 250');
      const row = db.prepare(`SELECT count(*) AS count FROM cookies
        WHERE host_key IN ('claude.ai', '.claude.ai')
        AND name IN ('sessionKey', 'sessionKeyV3')
        AND (expires_utc = 0 OR expires_utc > ?)
        AND (length(encrypted_value) > 0 OR length(value) > 0)`).get(chromiumTime);
      if (row.count > 0) return true;
    } finally { db.close(); }
  }
  return false;
}
module.exports = { isAuthenticated };
