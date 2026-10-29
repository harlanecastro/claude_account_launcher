const path = require('node:path');
const { restoreBounds, readState, writeState } = require('./window-state');

function createDesktop({ electron, getProfiles, launchProfile, stateFile, background = false, onError = console.error }) {
  const { app, BrowserWindow, Tray, Menu, nativeImage, nativeTheme, screen } = electron;
  const assets = path.join(__dirname, 'assets');
  if (process.platform === 'darwin') app.dock?.setIcon(path.join(assets, 'icon.png'));
  let quitting = false, timer, saveErrorReported = false;
  const saved = readState(stateFile);
  const bounds = restoreBounds(saved.bounds, screen.getAllDisplays().map(display => display.workArea));
  const win = new BrowserWindow({
    ...bounds, minWidth: 700, minHeight: 580, show: false,
    backgroundColor: '#191919', title: app.name, icon: path.join(assets, 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  let pendingMaximize = saved.maximized === true;
  let hidden = true;
  function persist() {
    clearTimeout(timer);
    if (win.isDestroyed()) return;
    try {
      writeState(stateFile, { bounds: win.getNormalBounds(), maximized: pendingMaximize || win.isMaximized() });
    } catch (error) {
      if (!saveErrorReported) { saveErrorReported = true; onError(new Error('Não foi possível salvar o tamanho da janela. ' + error.message)); }
    }
  }
  function scheduleSave() { clearTimeout(timer); timer = setTimeout(persist, 200); }
  function showWindow() {
    if (win.isDestroyed()) return;
    if (process.platform === 'darwin') { app.dock?.show(); }
    win.setSkipTaskbar(false);
    if (win.isMinimized()) win.restore();
    if (pendingMaximize) { win.maximize(); pendingMaximize = false; }
    win.show(); win.focus(); hidden = false;
  }
  function hideWindow() {
    persist();
    win.hide(); win.setSkipTaskbar(true); hidden = true;
    if (process.platform === 'darwin') app.dock?.hide();
  }
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  for (const event of ['resize', 'move', 'maximize', 'unmaximize']) win.on(event, scheduleSave);
  win.on('minimize', () => { if (!quitting) hideWindow(); });
  win.on('close', event => {
    persist();
    if (!quitting) { event.preventDefault(); hideWindow(); }
  });

  function trayImage() {
    if (process.platform === 'darwin') {
      const image = nativeImage.createFromPath(path.join(assets, 'trayTemplate.png'));
      image.setTemplateImage(true);
      return image;
    }
    // Windows can use a light app theme and a dark taskbar independently.
    const dark = nativeTheme.shouldUseDarkColorsForSystemIntegratedUI;
    return path.join(assets, `tray-${dark ? 'white' : 'black'}.ico`);
  }
  const tray = new Tray(trayImage());
  function updateTrayTheme() { if (!tray.isDestroyed()) tray.setImage(trayImage()); }
  nativeTheme.on('updated', updateTrayTheme);
  tray.setToolTip(app.name);
  let menu;
  function refreshProfiles() {
    const profiles = getProfiles();
    const items = profiles.map(profile => ({
      id: profile.id, label: `Abrir ${profile.name.replace(/&/g, '&&')}`,
      click: () => Promise.resolve().then(() => launchProfile(profile.id)).catch(onError),
    }));
    menu = Menu.buildFromTemplate([
      { label: 'Abrir aplicativo', click: showWindow },
      { type: 'separator' },
      ...(items.length ? items : [{ label: 'Nenhum perfil cadastrado', enabled: false }]),
      { type: 'separator' },
      { label: 'Sair', click: () => app.quit() },
    ]);
    tray.setContextMenu(menu);
    if (!win.webContents.isDestroyed()) win.webContents.send('profiles-changed');
  }
  refreshProfiles();
  if (process.platform === 'win32') tray.on('click', () => tray.popUpContextMenu());
  tray.on('double-click', showWindow);
  app.on('activate', showWindow);
  app.on('before-quit', () => { quitting = true; persist(); });
  app.on('will-quit', () => { clearTimeout(timer); nativeTheme.removeListener('updated', updateTrayTheme); tray.destroy(); });
  const ready = win.loadFile(path.join(__dirname, 'index.html'));
  ready.then(() => { if (!background) showWindow(); }).catch(onError);
  if (background) { win.setSkipTaskbar(true); if (process.platform === 'darwin') app.dock?.hide(); }
  return { win, tray, ready, showWindow, hideWindow, refreshProfiles, persist, get menu() { return menu; }, get hidden() { return hidden; } };
}
module.exports = { createDesktop };
