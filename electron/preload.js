/**
 * electron/preload.js
 *
 * Runs in the renderer context but with Node.js access.
 * Uses contextBridge to safely expose a typed API to the React app,
 * with contextIsolation: true (no direct Node access from renderer).
 *
 * All exposed methods return Promises.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // ── Metadata ──────────────────────────────────────────────────────────────
  /**
   * Fetches metadata for a single URL.
   * @param {string} url
   * @returns {Promise<{success: boolean, data?: Object, error?: string}>}
   */
  fetchMetadata: (url) => ipcRenderer.invoke('metadata:fetch', url),

  /**
   * Fetches flat playlist metadata.
   * @param {string} url
   * @returns {Promise<{success: boolean, data?: Object[], error?: string}>}
   */
  fetchPlaylistMetadata: (url) => ipcRenderer.invoke('metadata:fetchPlaylist', url),

  /**
   * Registers a listener for long-running metadata fetch operations (e.g., spotDL).
   * @param {Function} callback
   * @returns {Function} cleanup
   */
  onMetadataProgress: (callback) => {
    const handler = (_event, message) => callback(message);
    ipcRenderer.on('metadata:progress', handler);
    return () => ipcRenderer.removeListener('metadata:progress', handler);
  },

  // ── Downloads ─────────────────────────────────────────────────────────────
  /**
   * Starts a download. Progress events arrive via onDownloadProgress().
   * @param {Object} item    - { id, url, title, uploader, thumbnail }
   * @param {Object} options - { outputDir?, audioBitDepth? }
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  startDownload: (item, options) => ipcRenderer.invoke('download:start', item, options),

  /**
   * Cancels an active download.
   * @param {string} id - Download ID
   */
  cancelDownload: (id) => ipcRenderer.send('download:cancel', id),

  /**
   * Registers a listener for real-time download progress events.
   * Callback receives: { id, status, progress, speed, eta, error? }
   * @param {Function} callback
   * @returns {Function} cleanup function to remove the listener
   */
  onDownloadProgress: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('download:progress', handler);
    return () => ipcRenderer.removeListener('download:progress', handler);
  },

  // ── File System ───────────────────────────────────────────────────────────
  /**
   * Opens a native folder picker dialog.
   * @returns {Promise<{success: boolean, path?: string}>}
   */
  chooseOutputDir: () => ipcRenderer.invoke('dialog:chooseDir'),

  /**
   * Opens the output folder in Explorer / Finder.
   * @param {string} [dirPath] - Defaults to ~/Music/YtoWave
   */
  openOutputDir: (dirPath) => ipcRenderer.invoke('shell:openOutputDir', dirPath),

  // ── Health / Config ───────────────────────────────────────────────────────
  /**
   * Checks that yt-dlp and ffmpeg binaries are present.
   * @returns {Promise<{[name: string]: {ok: boolean, path?: string, error?: string}}>}
   */
  checkBinaries: () => ipcRenderer.invoke('binary:check'),

  /**
   * Returns the default output directory path.
   * @returns {Promise<string>}
   */
  getDefaultOutputDir: () => ipcRenderer.invoke('app:getDefaultOutputDir'),
});
