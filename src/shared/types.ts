export interface SweatShopAPI {
  platform: string;
  versions: {
    chrome: string;
    node: string;
    electron: string;
  };
}

declare global {
  interface Window {
    sweatshop: SweatShopAPI;
  }
}
