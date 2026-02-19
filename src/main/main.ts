import { app, BrowserWindow } from 'electron';
import * as path from 'path';
import * as os from 'os';
import { initDatabase, closeDatabase } from './services/database';
import { registerIpcHandlers } from './ipc-handlers';

// Avoid GPU cache permission errors (VS Code terminal inherits restrictive paths)
app.setPath('userData', path.join(os.homedir(), '.sweatshop'));

// SWEATSHOP_DEV=1 is set by the `dev` script. `start` and `build` use the built files.
const isDev = process.env.SWEATSHOP_DEV === '1';

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'SweatShop',
    icon: path.join(__dirname, '../../assets/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  if (isDev) {
    win.loadURL('http://localhost:5173');
  } else {
    win.loadFile(path.join(__dirname, '../../renderer/index.html'));
  }
}

app.whenReady().then(() => {
  // Initialize database at ~/.sweatshop/
  initDatabase(app.getPath('userData'));

  // Register IPC handlers before creating windows
  registerIpcHandlers();

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  closeDatabase();
});
