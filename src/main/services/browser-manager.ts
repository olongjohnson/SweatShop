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

class BrowserManager {
  private views = new Map<string, WebContentsView>();
  private mainWindow: BrowserWindow | null = null;

  setMainWindow(win: BrowserWindow): void {
    this.mainWindow = win;
  }

  create(agentId: string): void {
    if (this.views.has(agentId)) return;
    if (!this.mainWindow) return;

    const view = new WebContentsView({
      webPreferences: {
        partition: `persist:agent-${agentId}`,
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

    this.views.set(agentId, view);
  }

  loadURL(agentId: string, url: string): void {
    const view = this.views.get(agentId);
    if (!view) return;
    if (!isAllowedURL(url)) return;
    view.webContents.loadURL(url);
  }

  show(agentId: string, bounds: ViewBounds): void {
    if (!this.mainWindow) return;

    // Hide all first
    this.hideAll();

    const view = this.views.get(agentId);
    if (!view) return;

    this.mainWindow.contentView.addChildView(view);
    view.setBounds({
      x: Math.round(bounds.x),
      y: Math.round(bounds.y),
      width: Math.round(bounds.width),
      height: Math.round(bounds.height),
    });
  }

  setBounds(agentId: string, bounds: ViewBounds): void {
    const view = this.views.get(agentId);
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

  goBack(agentId: string): void {
    const view = this.views.get(agentId);
    if (view?.webContents.canGoBack()) {
      view.webContents.goBack();
    }
  }

  goForward(agentId: string): void {
    const view = this.views.get(agentId);
    if (view?.webContents.canGoForward()) {
      view.webContents.goForward();
    }
  }

  reload(agentId: string): void {
    const view = this.views.get(agentId);
    if (view) view.webContents.reload();
  }

  getURL(agentId: string): string {
    const view = this.views.get(agentId);
    return view?.webContents.getURL() ?? '';
  }

  destroy(agentId: string): void {
    const view = this.views.get(agentId);
    if (!view) return;

    if (this.mainWindow) {
      try {
        this.mainWindow.contentView.removeChildView(view);
      } catch { /* not attached */ }
    }
    // WebContentsView cleanup handled by GC
    this.views.delete(agentId);
  }
}

export const browserManager = new BrowserManager();
