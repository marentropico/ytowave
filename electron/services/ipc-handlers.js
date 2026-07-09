/**
 * electron/services/ipc-handlers.js
 *
 * Registers all ipcMain handlers. This is the single bridge between
 * the renderer process (React) and the Node.js services.
 *
 * Channel map:
 *   invoke  'metadata:fetch'       → fetchMetadata(url)
 *   invoke  'download:start'       → startDownload(item, options)
 *   on      'download:cancel'      → cancelDownload(id)
 *   invoke  'dialog:chooseDir'     → shows native folder picker
 *   invoke  'shell:openOutputDir'  → opens folder in Explorer/Finder
 *   invoke  'binary:check'         → verifies both binaries exist
 */

const { ipcMain, dialog, shell } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');

const { fetchMetadata, fetchPlaylistMetadata } = require('./metadata-service');
const { startDownload, cancelDownload, DEFAULT_OUT_DIR } = require('./download-service');
const { resolveBinary } = require('./binary-resolver');

let mainWindow = null;

function registerIpcHandlers(win) {
  mainWindow = win;

  // ── Metadata ─────────────────────────────────────────────────────────────

  ipcMain.handle('metadata:fetch', async (_event, url) => {
    try {
      const metadata = await fetchMetadata(url);
      return { success: true, data: metadata };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('metadata:fetchPlaylist', async (event, url) => {
    try {
      const entries = await fetchPlaylistMetadata(url, event.sender);
      return { success: true, data: entries };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ── Downloads ─────────────────────────────────────────────────────────────

  /**
   * Starts a download. Progress events are pushed to renderer via:
   *   webContents.send('download:progress', { id, status, progress, speed, eta })
   */
  ipcMain.handle('download:start', async (event, item, options) => {
    try {
      // Ensure output directory exists
      const outDir = options?.outputDir || DEFAULT_OUT_DIR;
      fs.mkdirSync(outDir, { recursive: true });

      await startDownload(item, event.sender, options);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.on('download:cancel', (_event, id) => {
    cancelDownload(id);
  });

  // ── File System / Shell ───────────────────────────────────────────────────

  ipcMain.handle('dialog:chooseDir', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Escolher pasta de destino',
      defaultPath: DEFAULT_OUT_DIR,
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled) return { success: false };
    return { success: true, path: result.filePaths[0] };
  });

  ipcMain.handle('shell:openOutputDir', async (_event, dirPath) => {
    const target = dirPath || DEFAULT_OUT_DIR;
    fs.mkdirSync(target, { recursive: true });
    await shell.openPath(target);
    return { success: true };
  });

  // ── Binary Health Check ───────────────────────────────────────────────────

  ipcMain.handle('binary:check', () => {
    const results = {};

    for (const name of ['yt-dlp', 'ffmpeg']) {
      try {
        results[name] = { ok: true, path: resolveBinary(name) };
      } catch (err) {
        results[name] = { ok: false, error: err.message };
      }
    }

    return results;
  });

  // ── App info ──────────────────────────────────────────────────────────────

  ipcMain.handle('app:getDefaultOutputDir', () => DEFAULT_OUT_DIR);
}

function unregisterIpcHandlers() {
  const channels = [
    'metadata:fetch',
    'metadata:fetchPlaylist',
    'download:start',
    'download:cancel',
    'dialog:chooseDir',
    'shell:openOutputDir',
    'binary:check',
    'app:getDefaultOutputDir',
  ];
  channels.forEach((ch) => {
    ipcMain.removeAllListeners(ch);
    if (ipcMain.removeHandler) ipcMain.removeHandler(ch);
  });
}

module.exports = { registerIpcHandlers, unregisterIpcHandlers };
