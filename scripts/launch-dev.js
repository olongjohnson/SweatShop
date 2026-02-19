const { spawn } = require('child_process');
const path = require('path');

delete process.env.ELECTRON_RUN_AS_NODE;
process.env.SWEATSHOP_DEV = '1';

const electronPath = require('electron');
const appPath = path.join(__dirname, '..');

const child = spawn(electronPath, [appPath], {
  stdio: 'inherit',
  env: process.env,
});

child.on('close', (code) => process.exit(code));
