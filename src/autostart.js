const fs = require('node:fs/promises');
const path = require('node:path');
const LABEL = 'com.claudeaccountlauncher.desktop';
function escapeXML(value) { return value.replace(/[<>&"']/g, char => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[char])); }
function launchAgent(executable) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${LABEL}</string>
<key>ProgramArguments</key><array><string>${escapeXML(executable)}</string><string>--background</string></array>
<key>RunAtLoad</key><true/>
<key>LimitLoadToSessionType</key><string>Aqua</string>
<key>ProcessType</key><string>Interactive</string>
</dict></plist>
`;
}
async function registerAutostart(app, platform = process.platform, executable = process.execPath) {
  // Register the installed binary, never the shared Electron development runtime.
  if (!app.isPackaged) return;
  if (platform === 'darwin') {
    if (executable.startsWith('/Volumes/') || executable.includes('/AppTranslocation/')) throw new Error('Instale o aplicativo na pasta Aplicativos e abra-o de lá para ativar a inicialização automática.');
    const file = path.join(app.getPath('home'), 'Library', 'LaunchAgents', `${LABEL}.plist`);
    const content = launchAgent(executable);
    await fs.mkdir(path.dirname(file), { recursive: true });
    try { if (await fs.readFile(file, 'utf8') === content) return; } catch (error) { if (error.code !== 'ENOENT') throw error; }
    await fs.writeFile(file + '.tmp', content, { mode: 0o644 });
    await fs.rename(file + '.tmp', file);
  } else if (platform === 'win32') {
    const settings = { path: executable, args: ['--background'] };
    app.setLoginItemSettings({ openAtLogin: true, enabled: true, name: LABEL, ...settings });
    const result = app.getLoginItemSettings(settings);
    if (!result.openAtLogin || !result.executableWillLaunchAtLogin) throw new Error('O Windows não ativou a inicialização automática; verifique Aplicativos > Inicialização nas Configurações.');
  }
}
module.exports = { registerAutostart, launchAgent };
