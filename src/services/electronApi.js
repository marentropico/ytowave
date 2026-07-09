// src/services/electronApi.js
//
// Thin wrapper around window.electronAPI.
// Falls back gracefully when running outside Electron (e.g., browser preview).

const api = window.electronAPI ?? null;

function assertApi() {
  if (!api) throw new Error('electronAPI not available — running outside Electron?');
}

export const electronApi = {
  // Metadata
  fetchMetadata:         (url)              => { assertApi(); return api.fetchMetadata(url); },
  fetchPlaylistMetadata: (url)              => { assertApi(); return api.fetchPlaylistMetadata(url); },
  onMetadataProgress:    (cb)               => {
    if (!api) return () => {};
    return api.onMetadataProgress(cb);
  },

  // Downloads
  startDownload:         (item, options)    => { assertApi(); return api.startDownload(item, options); },
  cancelDownload:        (id)               => { assertApi(); return api.cancelDownload(id); },

  // Progress listener — returns cleanup fn
  onDownloadProgress:    (cb)               => {
    if (!api) return () => {};
    return api.onDownloadProgress(cb);
  },

  // File system
  chooseOutputDir:       ()                 => { assertApi(); return api.chooseOutputDir(); },
  openOutputDir:         (dir)              => { assertApi(); return api.openOutputDir(dir); },

  // Health
  checkBinaries:         ()                 => { assertApi(); return api.checkBinaries(); },
  getDefaultOutputDir:   ()                 => { assertApi(); return api.getDefaultOutputDir(); },

  // Check if we're in Electron
  isElectron:            ()                 => Boolean(api),
};
