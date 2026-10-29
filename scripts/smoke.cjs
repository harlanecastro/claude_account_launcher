const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-launcher-smoke-'));
app.setPath('userData', temp);
const state = { platform: 'darwin', executable: '/Applications/Claude.app', profiles: [] };
ipcMain.handle('state', () => ({ok:true,value:state}));
ipcMain.handle('add', (_, name) => {state.profiles.push({id:'test',name}); return {ok:true,value:state};});
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width:1000, height:750, webPreferences: { preload:path.join(__dirname,'../src/preload.js'), contextIsolation: true, sandbox: true } });
  try {
    await win.loadFile(path.join(__dirname, '../src/index.html'));
    await win.webContents.executeJavaScript(`new Promise(resolve => setTimeout(resolve, 150))`);
    if (!await win.webContents.executeJavaScript(`document.querySelector('.empty') !== null && document.getElementById('toast').hidden`)) throw new Error('Initial render failed');
    await win.webContents.executeJavaScript(`document.getElementById('add').click(); document.getElementById('name').value = 'Trabalho'; document.getElementById('form').requestSubmit(); void 0;`);
    await win.webContents.executeJavaScript(`new Promise(resolve => setTimeout(resolve, 150))`);
    if (!await win.webContents.executeJavaScript(`document.querySelector('.card h2').textContent === 'Trabalho' && !document.getElementById('editor').open`)) throw new Error('Profile creation failed');
    fs.mkdirSync(path.join(__dirname,'../dist'),{recursive:true});
    fs.writeFileSync(path.join(__dirname, '../dist/preview.png'), (await win.webContents.capturePage()).toPNG());
    console.log('PASS: real preload IPC, initial render, profile dialog and creation.');
    app.exit(0);
  } catch (error) { console.error(error); app.exit(1); }
}).catch(error => { console.error(error); app.exit(1); });
app.on('will-quit', () => fs.rmSync(temp, {recursive:true,force:true}));
