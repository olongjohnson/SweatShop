import { app, BrowserWindow } from 'electron';
import * as path from 'path';
import * as os from 'os';
import { initDatabase, closeDatabase } from './services/database';
import { initSettings } from './services/settings';
import { registerIpcHandlers } from './ipc-handlers';
import { browserManager } from './services/browser-manager';
import { lwcPreview } from './services/lwc-preview';

// Allow SDK to spawn claude CLI (blocks nested sessions if CLAUDECODE is set)
delete process.env.CLAUDECODE;

// Avoid GPU cache permission errors (VS Code terminal inherits restrictive paths)
app.setPath('userData', path.join(os.homedir(), '.sweatshop'));

// SWEATSHOP_DEV=1 is set by the `dev` script. `start` and `build` use the built files.
const isDev = process.env.SWEATSHOP_DEV === '1';

// Single-instance lock — focus existing window if a second instance launches
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const wins = BrowserWindow.getAllWindows();
    if (wins.length > 0) {
      if (wins[0].isMinimized()) wins[0].restore();
      wins[0].focus();
    }
  });
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'SweatShop',
    icon: path.join(__dirname, '../../assets/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      sandbox: false,
    },
  });

  if (isDev) {
    win.loadURL('http://localhost:5173');
  } else {
    win.loadFile(path.join(__dirname, '../../renderer/index.html'));
  }

  return win;
}

app.whenReady().then(() => {
  // Initialize settings and database at ~/.sweatshop/
  const userData = app.getPath('userData');
  initSettings(userData);
  initDatabase(userData);

  // Register IPC handlers before creating windows
  registerIpcHandlers();

  const win = createWindow();
  browserManager.setMainWindow(win);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const newWin = createWindow();
      browserManager.setMainWindow(newWin);
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  lwcPreview.stopAll();
  closeDatabase();
});
