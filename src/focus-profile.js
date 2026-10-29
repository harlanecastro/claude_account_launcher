const path = require('node:path');

async function focusProfile(platform, executable, directory, run) {
  if (platform === 'darwin') {
    const binary = path.join(executable, 'Contents', 'MacOS', 'Claude');
    const { stdout } = await run('/bin/ps', ['-axo', 'pid=,command='], { timeout: 5000 });
    const pid = findMacProfilePid(stdout, binary, directory);
    if (!pid) return false;
    // NSRunningApplication targets this PID, even with several Claude instances.
    const script = `ObjC.import('AppKit'); var app = $.NSRunningApplication.runningApplicationWithProcessIdentifier(${pid}); app ? !!app.activateWithOptions(3) : false;`;
    const result = await run('/usr/bin/osascript', ['-l', 'JavaScript', '-e', script], { timeout: 5000 });
    if (result.stdout.trim() !== 'true') throw new Error('Não foi possível trazer a janela desta conta para frente.');
    return true;
  }
  if (platform === 'win32') {
    const literal = value => "'" + value.replace(/'/g, "''") + "'";
    const script = `$ErrorActionPreference = 'Stop'
$exe = ${literal(executable)}
$profileArg = ${literal('--user-data-dir=' + directory)}
$processes = @(Get-CimInstance Win32_Process -Filter "Name = 'Claude.exe'" | Where-Object {
  $_.ExecutablePath -eq $exe -and $_.CommandLine -and
  ($_.CommandLine.Contains('"' + $profileArg + '"') -or $_.CommandLine.EndsWith($profileArg) -or $_.CommandLine.Contains($profileArg + ' --'))
})
if ($processes.Count -eq 0) { Write-Output 'absent'; exit }
Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class LauncherWindow { [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr h, int c); [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h); }'
foreach ($entry in $processes) {
  $p = Get-Process -Id $entry.ProcessId -ErrorAction SilentlyContinue
  if ($p -and $p.MainWindowHandle -ne 0) {
    [void][LauncherWindow]::ShowWindowAsync($p.MainWindowHandle, 9)
    if ([LauncherWindow]::SetForegroundWindow($p.MainWindowHandle)) { Write-Output 'focused'; exit }
  }
}
throw 'Não foi possível trazer a janela desta conta para frente.'`;
    const { stdout } = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: 15000 });
    return stdout.trim() === 'focused';
  }
  return false;
}
function findMacProfilePid(output, binary, directory) {
  const argument = `--user-data-dir=${directory}`;
  for (const line of output.split(/\r?\n/)) {
    const match = line.trim().match(/^(\d+)\s+(.+)$/);
    if (!match || !match[2].startsWith(binary + ' ')) continue;
    const args = match[2].slice(binary.length + 1);
    if (args === argument || args.endsWith(' ' + argument) || args.includes(argument + ' --')) return Number(match[1]);
  }
  return null;
}
module.exports = { focusProfile, findMacProfilePid };
