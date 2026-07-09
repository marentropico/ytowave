// src/hooks/useDownloadEvents.js
//
// Subscribes to IPC 'download:progress' events from the main process and
// updates the Zustand store. Call this once at the app root level.

import { useEffect } from 'react';
import { electronApi } from '../services/electronApi';
import { useDownloadStore } from '../store/downloadStore';

export function useDownloadEvents() {
  const updateItem = useDownloadStore((s) => s.updateItem);

  useEffect(() => {
    const cleanup = electronApi.onDownloadProgress((payload) => {
      const { id, status, progress, speed, eta, error, total } = payload;

      updateItem(id, {
        ...(status   !== undefined && { status }),
        ...(progress !== undefined && { progress }),
        ...(speed    !== undefined && { speed }),
        ...(eta      !== undefined && { eta }),
        ...(error    !== undefined && { error }),
        ...(total    !== undefined && { total }),
      });
    });

    return cleanup;
  }, [updateItem]);
}
