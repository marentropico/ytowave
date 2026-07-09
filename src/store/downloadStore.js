// src/store/downloadStore.js
//
// Zustand store — single source of truth for the download queue.
// Each item in `queue` has:
//   {
//     id:         string (uuid),
//     url:        string,
//     title:      string,
//     uploader:   string,
//     thumbnail:  string | null,
//     duration:   number (seconds),
//     status:     'pending' | 'fetching' | 'downloading' | 'converting' | 'embedding' | 'done' | 'skipped' | 'error' | 'cancelled',
//     progress:   number (0-100),
//     speed:      string,
//     eta:        string,
//     error:      string | null,
//     addedAt:    Date,
//   }

import { create } from 'zustand';

let nextId = 1;
function generateId() {
  return `dl-${Date.now()}-${nextId++}`;
}

export const useDownloadStore = create((set, get) => ({
  // ── State ──────────────────────────────────────────────────────────────
  queue: [],
  outputDir: null,        // null = use default from electron
  audioFormat: 'wav',     // 'wav', 'flac', or 'mp3'
  audioQuality: '24',     // '24' or '16' for wav/flac, '320' or '192' for mp3
  binariesOk: null,       // null = unchecked, { 'yt-dlp': {...}, 'ffmpeg': {...} }

  // ── Queue operations ──────────────────────────────────────────────────
  addToQueue: (metadata, url) => {
    const item = {
      id: generateId(),
      url,
      originalUrl: url,
      urlPool: [url],
      title:     metadata.title,
      uploader:  metadata.uploader,
      artist:    metadata.artist,
      album:     metadata.album,
      thumbnail: metadata.thumbnail,
      duration:  metadata.duration,
      status:    'pending',
      progress:  0,
      speed:     '',
      eta:       '',
      error:     null,
      addedAt:   new Date(),
    };
    set((s) => ({ queue: [...s.queue, item] }));
    return item;
  },

  addAlternativeUrl: (id, altUrl) => {
    set((s) => ({
      queue: s.queue.map((item) => {
        if (item.id !== id) return item;
        const cleanUrl = altUrl.trim();
        if (!cleanUrl) return item;
        const newPool = item.urlPool ? [...item.urlPool] : [item.url];
        if (!newPool.includes(cleanUrl)) {
          newPool.push(cleanUrl);
        }
        return { ...item, url: cleanUrl, urlPool: newPool, error: null };
      }),
    }));
  },

  setActiveUrl: (id, url) => {
    set((s) => ({
      queue: s.queue.map((item) =>
        item.id === id ? { ...item, url, error: null } : item
      ),
    }));
  },

  removeFromQueue: (id) => {
    set((s) => ({ queue: s.queue.filter((i) => i.id !== id) }));
  },

  clearCompleted: () => {
    set((s) => ({
      queue: s.queue.filter((i) => !['done', 'skipped', 'cancelled', 'error'].includes(i.status)),
    }));
  },

  clearAll: () => set({ queue: [] }),

  // ── Item update (called by IPC progress events) ────────────────────────
  updateItem: (id, patch) => {
    set((s) => ({
      queue: s.queue.map((item) =>
        item.id === id ? { ...item, ...patch } : item
      ),
    }));
  },

  setItemStatus: (id, status, extra = {}) => {
    set((s) => ({
      queue: s.queue.map((item) =>
        item.id === id ? { ...item, status, ...extra } : item
      ),
    }));
  },

  // ── Settings ──────────────────────────────────────────────────────────
  setOutputDir:    (dir)   => set({ outputDir: dir }),
  setAudioConfig:  (format, quality) => set({ audioFormat: format, audioQuality: quality }),
  setBinariesOk:   (val)   => set({ binariesOk: val }),

  // ── Selectors (computed) ──────────────────────────────────────────────
  getItem: (id) => get().queue.find((i) => i.id === id),
  activeCount: () => get().queue.filter((i) =>
    ['fetching', 'downloading', 'converting', 'embedding'].includes(i.status)
  ).length,
  doneCount: () => get().queue.filter((i) => i.status === 'done').length,

  getEstimatedSize: (durationSecs) => {
    if (!durationSecs || durationSecs <= 0) return null;
    const { audioFormat, audioQuality } = get();
    let bytesPerSecond = 0;

    if (audioFormat === 'wav') {
      // Assuming 48kHz Stereo: 48000 * 2 channels * (bits / 8)
      const bytesPerSample = (audioQuality === '24' ? 3 : 2);
      bytesPerSecond = 48000 * 2 * bytesPerSample;
    } else if (audioFormat === 'flac') {
      // Typically ~65% of WAV size
      const bytesPerSample = (audioQuality === '24' ? 3 : 2);
      bytesPerSecond = 48000 * 2 * bytesPerSample * 0.65;
    } else if (audioFormat === 'mp3') {
      // Quality is kbps (kilobits per second)
      const kbps = parseInt(audioQuality, 10);
      bytesPerSecond = (kbps * 1000) / 8;
    }

    const totalBytes = bytesPerSecond * durationSecs;
    const mb = totalBytes / (1024 * 1024);
    return Math.max(0.1, mb).toFixed(1);
  },
}));
