const sharp = require('sharp');
const path = require('path');

const src = path.join(__dirname, '..', 'SweatShopLogo.jpg');
const dest = path.join(__dirname, '..', 'assets', 'icon.png');

const fs = require('fs');
fs.mkdirSync(path.join(__dirname, '..', 'assets'), { recursive: true });

// Electron nativeImage can load PNG for the window icon on Windows
sharp(src)
  .resize(256, 256)
  .png()
  .toFile(dest)
  .then(() => console.log('Icon built:', dest))
  .catch(err => { console.error(err); process.exit(1); });
