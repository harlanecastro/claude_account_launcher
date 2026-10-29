const path = require('node:path');
const { execFile, spawn } = require('node:child_process');
const { promisify } = require('node:util');
const fs = require('node:fs/promises');
const run = promisify(execFile);

function launchSpec(platform, executable, directory) {
  if (platform === 'darwin') return { command: '/usr/bin/open', args: ['-n', '-a', executable, '--args', `--user-data-dir=${directory}`] };
  if (platform === 'win32') return { command: executable, args: [`--user-data-dir=${directory}`] };
  throw new Error('Este aplicativo oferece suporte a macOS e Windows.');
}
async function exists(file) { try { await fs.access(file); return true; } catch { return false; } }
async function detectClaude(platform, home, env = process.env) {
  const candidates = platform === 'darwin'
    ? ['/Applications/Claude.app', path.join(home, 'Applications', 'Claude.app')]
    : [env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'AnthropicClaude', 'Claude.exe'), env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Programs', 'Claude', 'Claude.exe')].filter(Boolean);
  for (const candidate of candidates) if (await exists(candidate)) return candidate;
  if (platform === 'win32') {
    try {
      const { stdout } = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Get-AppxPackage *claude* | ForEach-Object { Join-Path $_.InstallLocation "app\\Claude.exe" }'], { windowsHide: true, timeout: 15000 });
      for (const file of stdout.trim().split(/\r?\n/)) if (file && await exists(file)) return file;
    } catch { /* Manual selection remains available. */ }
  }
  return null;
}
async function launch(platform, executable, directory) {
  await fs.mkdir(directory, { recursive: true });
  const spec = launchSpec(platform, executable, directory);
  if (platform === 'darwin') await run(spec.command, spec.args, { timeout: 20000 });
  else await new Promise((resolve, reject) => {
    const child = spawn(spec.command, spec.args, { detached: true, stdio: 'ignore', windowsHide: false });
    child.once('error', reject);
    child.once('spawn', () => { child.unref(); resolve(); });
  });
}
module.exports = { launchSpec, detectClaude, launch };
