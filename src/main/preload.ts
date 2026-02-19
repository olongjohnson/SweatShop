import { contextBridge } from 'electron';
import type { SweatShopAPI } from '../shared/types';

const api: SweatShopAPI = {
  platform: process.platform,
  versions: {
    chrome: process.versions.chrome ?? 'unknown',
    node: process.versions.node ?? 'unknown',
    electron: process.versions.electron ?? 'unknown',
  },
};

contextBridge.exposeInMainWorld('sweatshop', api);
