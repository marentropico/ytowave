/**
 * electron/main.js
 *
 * Electron Main Process entry point.
 * Creates the BrowserWindow, loads the React app (Vite dev server in dev,
 * built index.html in production), and registers all IPC handlers.
 */

const { app, BrowserWindow, nativeTheme } = require('electron');
const path = require('path');
const { registerIpcHandlers, unregisterIpcHandlers } = require('./services/ipc-handlers');

const IS_DEV = process.env.NODE_ENV === 'development';

// ─── Window Creation ───────────────────────────────────────────────────────

function createWindow() {
  nativeTheme.themeSource = 'dark'; // Force dark mode

  const win = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#0f0f13',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    frame: process.platform !== 'win32',  // Frameless on Windows (custom titlebar in React)
    show: false, // Show only after ready-to-show to avoid flash
    icon: path.join(__dirname, '..', 'public', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,  // SECURITY: no Node in renderer
      sandbox: false,           // Needed for preload to use require()
      webSecurity: true,
    },
  });

  // Register IPC handlers before loading content
  registerIpcHandlers(win);

  // Load content
  if (IS_DEV) {
    win.loadURL('http://localhost:5173');
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  // Graceful show after paint
  win.once('ready-to-show', () => {
    win.show();
    win.focus();
  });

  win.on('closed', () => {
    unregisterIpcHandlers();
  });

  return win;
}

// ─── App Lifecycle ─────────────────────────────────────────────────────────

app.whenReady().then(() => {
  createWindow();

  // macOS: re-create window when dock icon is clicked and no windows are open
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Security: Prevent navigation and new window creation from the renderer
app.on('web-contents-created', (_event, contents) => {
  contents.on('will-navigate', (event, url) => {
    if (IS_DEV && url.startsWith('http://localhost:5173')) return;
    event.preventDefault();
  });
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
});
