const { spawn } = require('child_process');
const path = require('path');

// VS Code sets ELECTRON_RUN_AS_NODE=1 which prevents Electron from
// initializing its browser APIs. Must be removed before launching.
delete process.env.ELECTRON_RUN_AS_NODE;

const electronPath = require('electron');
const appPath = path.join(__dirname, '..');

const child = spawn(electronPath, [appPath], {
  stdio: 'inherit',
  env: process.env,
});

child.on('close', (code) => process.exit(code));
