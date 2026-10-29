const fs = require('node:fs');
const path = require('node:path');

function restoreBounds(saved, workAreas) {
  const valid = saved && ['width', 'height', 'x', 'y'].every(key => Number.isFinite(saved[key]));
  const area = (valid && workAreas.find(a => saved.x < a.x + a.width && saved.x + saved.width > a.x && saved.y < a.y + a.height && saved.y + saved.height > a.y)) || workAreas[0];
  const width = Math.min(area.width, Math.max(700, valid ? saved.width : 1000));
  const height = Math.min(area.height, Math.max(580, valid ? saved.height : 750));
  return {
    width, height,
    x: valid ? Math.max(area.x, Math.min(saved.x, area.x + area.width - width)) : Math.round(area.x + (area.width - width) / 2),
    y: valid ? Math.max(area.y, Math.min(saved.y, area.y + area.height - height)) : Math.round(area.y + (area.height - height) / 2),
  };
}
function readState(file) {
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}
function writeState(file, state) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file + '.tmp', JSON.stringify(state), { mode: 0o600 });
  fs.renameSync(file + '.tmp', file);
}
module.exports = { restoreBounds, readState, writeState };
