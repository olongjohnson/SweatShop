import { BrowserWindow, WebContentsView } from 'electron';

interface ViewBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

const ALLOWED_DOMAINS = [
  '.salesforce.com',
  '.force.com',
  '.lightning.force.com',
  '.visualforce.com',
  '.salesforce-setup.com',
];

function isAllowedURL(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ALLOWED_DOMAINS.some((domain) => parsed.hostname.endsWith(domain));
  } catch {
    return false;
  }
}

function isLocalDevURL(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

class BrowserManager {
  private views = new Map<string, WebContentsView>();
  private mainWindow: BrowserWindow | null = null;

  setMainWindow(win: BrowserWindow): void {
    this.mainWindow = win;
  }

  create(conscriptId: string): void {
    if (this.views.has(conscriptId)) return;
    if (!this.mainWindow) return;

    const view = new WebContentsView({
      webPreferences: {
        partition: `persist:conscript-${conscriptId}`,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    });

    // Restrict navigation to Salesforce domains
    view.webContents.on('will-navigate', (event, url) => {
      if (!isAllowedURL(url)) {
        event.preventDefault();
      }
    });

    // Block new window requests to non-Salesforce domains
    view.webContents.setWindowOpenHandler(({ url }) => {
      if (isAllowedURL(url)) {
        return { action: 'allow' };
      }
      return { action: 'deny' };
    });

    this.views.set(conscriptId, view);
  }

  createLocalPreview(viewId: string): void {
    if (this.views.has(viewId)) return;
    if (!this.mainWindow) return;

    const view = new WebContentsView({
      webPreferences: {
        partition: `persist:lwc-preview-${viewId}`,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    });

    // Restrict to localhost only
    view.webContents.on('will-navigate', (event, url) => {
      if (!isLocalDevURL(url)) {
        event.preventDefault();
      }
    });

    view.webContents.setWindowOpenHandler(({ url }) => {
      if (isLocalDevURL(url)) {
        return { action: 'allow' };
      }
      return { action: 'deny' };
    });

    this.views.set(viewId, view);
  }

  loadLocalURL(viewId: string, url: string): void {
    const view = this.views.get(viewId);
    if (!view) return;
    if (!isLocalDevURL(url)) return;
    view.webContents.loadURL(url);
  }

  loadURL(conscriptId: string, url: string): void {
    const view = this.views.get(conscriptId);
    if (!view) return;
    if (!isAllowedURL(url)) return;
    view.webContents.loadURL(url);
  }

  show(conscriptId: string, bounds: ViewBounds): void {
    if (!this.mainWindow) return;

    // Hide all first
    this.hideAll();

    const view = this.views.get(conscriptId);
    if (!view) return;

    this.mainWindow.contentView.addChildView(view);
    view.setBounds({
      x: Math.round(bounds.x),
      y: Math.round(bounds.y),
      width: Math.round(bounds.width),
      height: Math.round(bounds.height),
    });
  }

  setBounds(conscriptId: string, bounds: ViewBounds): void {
    const view = this.views.get(conscriptId);
    if (!view) return;
    view.setBounds({
      x: Math.round(bounds.x),
      y: Math.round(bounds.y),
      width: Math.round(bounds.width),
      height: Math.round(bounds.height),
    });
  }

  hideAll(): void {
    if (!this.mainWindow) return;
    for (const view of this.views.values()) {
      try {
        this.mainWindow.contentView.removeChildView(view);
      } catch {
        // View may not be attached
      }
    }
  }

  goBack(conscriptId: string): void {
    const view = this.views.get(conscriptId);
    if (view?.webContents.canGoBack()) {
      view.webContents.goBack();
    }
  }

  goForward(conscriptId: string): void {
    const view = this.views.get(conscriptId);
    if (view?.webContents.canGoForward()) {
      view.webContents.goForward();
    }
  }

  reload(conscriptId: string): void {
    const view = this.views.get(conscriptId);
    if (view) view.webContents.reload();
  }

  getURL(conscriptId: string): string {
    const view = this.views.get(conscriptId);
    return view?.webContents.getURL() ?? '';
  }

  destroy(conscriptId: string): void {
    const view = this.views.get(conscriptId);
    if (!view) return;

    if (this.mainWindow) {
      try {
        this.mainWindow.contentView.removeChildView(view);
      } catch { /* not attached */ }
    }
    // WebContentsView cleanup handled by GC
    this.views.delete(conscriptId);
  }
}

export const browserManager = new BrowserManager();
