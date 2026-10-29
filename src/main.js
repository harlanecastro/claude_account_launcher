const electron = require('electron');
const { app, ipcMain, dialog, shell, Menu } = electron;
const { createDesktop } = require('./desktop');
const { registerAutostart } = require('./autostart');
const path = require('node:path');
const fs = require('node:fs/promises');
const { randomUUID } = require('node:crypto');
const { detectClaude, launch } = require('./launcher');
const { isAuthenticated } = require('./profile-session');
const authentication = new Map();
let win, config, desktop;
let saveQueue = Promise.resolve();
const configFile = () => path.join(app.getPath('userData'), 'accounts.json');
const directory = id => path.join(app.getPath('userData'), 'profiles', id);
async function save() {
  const file = configFile();
  const content = JSON.stringify(config, null, 2);
  saveQueue = saveQueue.catch(() => {}).then(async () => {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file + '.tmp', content, { mode: 0o600 });
    await fs.rename(file + '.tmp', file);
    desktop?.refreshProfiles();
  });
  return saveQueue;
}
async function launchProfile(id) {
  const entry = profile(id);
  const { executable } = await state();
  if (!executable) throw new Error('Selecione o Claude Desktop em “Localizar Claude”.');
  try { await launch(process.platform, executable, directory(id)); }
  catch (error) { throw new Error('Não foi possível abrir o Claude. Confira o aplicativo selecionado. ' + error.message); }
  entry.lastOpened = new Date().toISOString();
  await save();
  return state();
}
async function state() {
  const executable = config.executable || await detectClaude(process.platform, app.getPath('home'));
  const profiles = config.profiles.map(entry => {
    try { authentication.set(entry.id, isAuthenticated(directory(entry.id))); }
    catch (error) { console.warn('Não foi possível consultar a sessão do perfil:', error.code || error.name); }
    return { ...entry, authenticated: authentication.get(entry.id) === true };
  });
  return { profiles, executable, platform: process.platform };
}
function handle(name, fn) {
  ipcMain.handle(name, async (event, ...args) => {
    if (event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame) throw new Error('Origem inválida.');
    try { return { ok: true, value: await fn(...args) }; }
    catch (error) { return { ok: false, error: error.message }; }
  });
}
function profile(id) {
  const found = config.profiles.find(p => p.id === id);
  if (!found) throw new Error('Perfil não encontrado.');
  return found;
}
function name(value) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 50) throw new Error('Informe um nome com até 50 caracteres.');
  return value.trim();
}
app.setName('Claude Account Launcher');
if (process.platform === 'win32') app.setAppUserModelId('com.claudeaccountlauncher.desktop');
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', (_, argv) => { if (!argv.includes('--background')) desktop?.showWindow(); });
  app.whenReady().then(async () => {
    try { config = JSON.parse(await fs.readFile(configFile(), 'utf8')); }
    catch (error) {
      if (error.code !== 'ENOENT') { dialog.showErrorBox('Não foi possível ler os perfis', 'O arquivo de configuração foi preservado. ' + error.message); app.quit(); return; }
      config = { executable: null, profiles: [] };
    }
    if (!Array.isArray(config.profiles) || config.profiles.some(p => !/^[a-f0-9-]{36}$/.test(p.id) || typeof p.name !== 'string')) { dialog.showErrorBox('Configuração inválida', 'Verifique o arquivo accounts.json na pasta de dados do aplicativo.'); app.quit(); return; }
    handle('state', state);
    handle('add', async value => { config.profiles.push({ id: randomUUID(), name: name(value), lastOpened: null }); await save(); return state(); });
    handle('rename', async (id, value) => { profile(id).name = name(value); await save(); return state(); });
    handle('remove', async id => {
      const entry = profile(id);
      const answer = await dialog.showMessageBox(win, { type: 'question', buttons: ['Cancelar', 'Remover perfil'], defaultId: 0, cancelId: 0, message: `Remover “${entry.name}” da lista?`, detail: 'Os dados e o login serão preservados na pasta do perfil.' });
      if (answer.response === 1) { config.profiles = config.profiles.filter(p => p.id !== id); await save(); }
      return state();
    });
    handle('launch', launchProfile);
    handle('folder', async id => { profile(id); await fs.mkdir(directory(id), { recursive: true }); const error = await shell.openPath(directory(id)); if (error) throw new Error(error); });
    handle('choose', async () => {
      const result = await dialog.showOpenDialog(win, { title: 'Selecione o Claude Desktop', properties: ['openFile'], filters: [{ name: 'Claude Desktop', extensions: process.platform === 'darwin' ? ['app'] : ['exe'] }] });
      if (!result.canceled) {
        const file = result.filePaths[0];
        if (path.basename(file).toLowerCase() !== (process.platform === 'darwin' ? 'claude.app' : 'claude.exe')) throw new Error('Selecione Claude.app ou Claude.exe.');
        config.executable = file; await save();
      }
      return state();
    });
    Menu.setApplicationMenu(Menu.buildFromTemplate([...(process.platform === 'darwin' ? [{ label: app.name, submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'quit' }] }] : []), { label: 'Editar', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] }]));
    desktop = createDesktop({
      electron,
      getProfiles: () => config.profiles,
      launchProfile,
      stateFile: path.join(app.getPath('userData'), 'window-state.json'),
      background: process.argv.includes('--background'),
      onError: error => dialog.showErrorBox('Claude Account Launcher', error.message),
    });
    win = desktop.win;
    await registerAutostart(app);
  }).catch(error => { dialog.showErrorBox('Erro ao iniciar', error.message); if (!desktop) app.quit(); });
  // Closing a window keeps the tray/menu-bar process alive; only “Sair” quits.
  app.on('window-all-closed', () => {});
}
