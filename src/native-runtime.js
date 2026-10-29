const path = require('node:path');
const { execFile, spawn } = require('node:child_process');
const { promisify } = require('node:util');
const run = promisify(execFile);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const quote = value => "'" + value.replace(/'/g, "''") + "'";

function launchSpec(platform, executable) {
  if (platform === 'darwin') return { command: '/usr/bin/open', args: ['-a', executable] };
  if (platform === 'win32') return { command: executable, args: [] };
  throw new Error('Este aplicativo oferece suporte a macOS e Windows.');
}
function macProcesses(output, executable) {
  const binary = path.posix.join(executable, 'Contents', 'MacOS', 'Claude');
  return output.split(/\r?\n/).flatMap(line => {
    const match = line.trim().match(/^(\d+)\s+(.+)$/);
    if (!match || (match[2] !== binary && !match[2].startsWith(binary + ' '))) return [];
    return [{ pid: Number(match[1]), relocated: match[2].includes('--user-data-dir') }];
  });
}
function createRuntime(platform, executable, execute = run) {
  async function list() {
    if (platform === 'darwin') {
      const { stdout } = await execute('/bin/ps', ['-axo', 'pid=,command='], { timeout: 5000 });
      return macProcesses(stdout, executable);
    }
    const script = `$ErrorActionPreference='Stop'; $items = @(Get-CimInstance Win32_Process -Filter "Name = 'Claude.exe'" | Where-Object { $_.ExecutablePath -eq ${quote(executable)} -and $_.CommandLine -notmatch '--type=' } | ForEach-Object { @{pid=[int]$_.ProcessId;relocated=($_.CommandLine -match '--user-data-dir')} }); ConvertTo-Json -InputObject $items -Compress`;
    const { stdout } = await execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: 15000 });
    return JSON.parse(stdout.trim() || '[]');
  }
  async function focus() {
    const current = (await list()).find(p => !p.relocated);
    if (!current) return false;
    if (platform === 'darwin') {
      const { stdout } = await execute('/usr/bin/osascript', ['-l', 'JavaScript', '-e', `ObjC.import('AppKit'); var a=$.NSRunningApplication.runningApplicationWithProcessIdentifier(${current.pid}); a ? !!a.activateWithOptions(3) : false;`], { timeout: 5000 });
      if (stdout.trim() !== 'true') throw new Error('Não foi possível exibir a janela do Claude.');
    } else {
      const script = `Add-Type 'using System; using System.Runtime.InteropServices; public class LauncherWindow { [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr h,int c); [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h); }'; $p=Get-Process -Id ${current.pid}; if ($p.MainWindowHandle -eq 0) { throw 'Janela do Claude indisponível' }; [void][LauncherWindow]::ShowWindowAsync($p.MainWindowHandle,9); if (-not [LauncherWindow]::SetForegroundWindow($p.MainWindowHandle)) { throw 'Não foi possível exibir o Claude' }`;
      await execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: 10000 });
    }
    return true;
  }
  async function stop() {
    for (const process of await list()) {
      if (platform === 'darwin') {
        await execute('/usr/bin/osascript', ['-l', 'JavaScript', '-e', `ObjC.import('AppKit'); var a=$.NSRunningApplication.runningApplicationWithProcessIdentifier(${process.pid}); a ? !!a.terminate : true;`], { timeout: 5000 });
      } else {
        await execute('taskkill.exe', ['/PID', String(process.pid)], { windowsHide: true, timeout: 10000 });
      }
    }
    const deadline = Date.now() + 30000;
    while ((await list()).length) {
      if (Date.now() > deadline) throw new Error('O Claude continua aberto. Salve o trabalho, escolha Sair no Claude e tente novamente; nenhum dado foi trocado.');
      await pause(250);
    }
  }
  async function start() {
    const spec = launchSpec(platform, executable);
    // Avoid inheriting overrides from a development shell.
    const env = { ...process.env };
    delete env.CLAUDE_USER_DATA_DIR;
    delete env.ELECTRON_RUN_AS_NODE;
    if (platform === 'darwin') await execute(spec.command, spec.args, { timeout: 20000, env });
    else await new Promise((resolve, reject) => {
      const child = spawn(spec.command, spec.args, { detached: true, stdio: 'ignore', windowsHide: false, env });
      child.once('error', reject);
      child.once('spawn', () => { child.unref(); resolve(); });
    });
    const deadline = Date.now() + 20000;
    while (!(await list()).some(p => !p.relocated)) {
      if (Date.now() > deadline) throw new Error('O Claude não confirmou a abertura. Os dados da conta selecionada foram preservados.');
      await pause(250);
    }
  }
  return { list, focus, stop, start };
}
function nativeDirectory(platform, home, env, executable) {
  if (platform === 'darwin') return path.posix.join(home, 'Library', 'Application Support', 'Claude');
  if (platform === 'win32') {
    const packageName = executable.match(/[\\/]WindowsApps[\\/]([^\\/]+)/i)?.[1];
    if (packageName) {
      const parts = packageName.split('_');
      const family = `${parts[0]}_${parts.at(-1)}`;
      return path.win32.join(env.LOCALAPPDATA, 'Packages', family, 'LocalCache', 'Roaming', 'Claude');
    }
    return path.win32.join(env.APPDATA, 'Claude');
  }
  throw new Error('Plataforma não suportada.');
}
module.exports = { createRuntime, launchSpec, macProcesses, nativeDirectory };
