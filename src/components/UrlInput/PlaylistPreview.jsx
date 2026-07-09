// src/components/UrlInput/PlaylistPreview.jsx
//
// Shown when a playlist URL is detected. Displays all tracks with thumbnails
// and offers "Download All" or individual track selection.

import { useState } from 'react';
import { useDownloadStore } from '../../store/downloadStore';
import { electronApi } from '../../services/electronApi';
import { useToast } from '../common/Toast';

function formatDuration(sec) {
  if (!sec) return '';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * @param {Object[]} entries   - Flat playlist entries from fetchPlaylistMetadata
 * @param {string}   url       - Original playlist URL
 * @param {Function} onConfirm - Called after downloads are queued
 * @param {Function} onDismiss - Called to dismiss the preview
 */
export function PlaylistPreview({ entries, url, onConfirm, onDismiss }) {
  const { toast }      = useToast();
  const addToQueue     = useDownloadStore((s) => s.addToQueue);
  const updateItem     = useDownloadStore((s) => s.updateItem);
  const outputDir      = useDownloadStore((s) => s.outputDir);
  const audioFormat    = useDownloadStore((s) => s.audioFormat);
  const audioQuality   = useDownloadStore((s) => s.audioQuality);
  const getEstimatedSize = useDownloadStore((s) => s.getEstimatedSize);

  // Track selection: all selected by default
  const [selected, setSelected] = useState(() => new Set(entries.map((e) => e.id)));
  const [isQueuing, setIsQueuing]  = useState(false);

  function toggleAll() {
    if (selected.size === entries.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(entries.map((e) => e.id)));
    }
  }

  function toggleOne(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleDownloadAll() {
    const toDownload = entries.filter((e) => selected.has(e.id));
    if (toDownload.length === 0) {
      toast.warn('Selecione pelo menos uma faixa.');
      return;
    }

    setIsQueuing(true);

    // Add all to queue first so the UI reflects immediately
    const queuedItems = toDownload.map((entry) => addToQueue(entry, entry.webpage_url));

    onConfirm(toDownload.length);

    // Fire downloads concurrently (but sensibly — max 3 at a time)
    const CONCURRENCY = 3;
    const chunks = [];
    for (let i = 0; i < queuedItems.length; i += CONCURRENCY) {
      chunks.push(queuedItems.slice(i, i + CONCURRENCY));
    }

    for (const chunk of chunks) {
      await Promise.allSettled(
        chunk.map(async (item) => {
          try {
            updateItem(item.id, { status: 'downloading' });
            const result = await electronApi.startDownload(item, {
              outputDir:     outputDir || undefined,
              audioFormat,
              audioQuality,
            });
            if (!result.success) {
              updateItem(item.id, { status: 'error', error: result.error });
            }
          } catch (err) {
            updateItem(item.id, { status: 'error', error: err.message });
          }
        })
      );
    }

    setIsQueuing(false);
  }

  const selectedCount = selected.size;
  const allSelected   = selectedCount === entries.length;

  // Calculate total size
  const totalSeconds = entries
    .filter(e => selected.has(e.id))
    .reduce((acc, curr) => acc + (curr.duration || 0), 0);
  const totalEstimatedMb = getEstimatedSize(totalSeconds);

  return (
    <div className="glass animate-slide-up flex flex-col gap-3 p-4 max-h-[380px]">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h3 className="font-semibold text-sm text-white">Playlist detectada</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            {entries.length} faixa{entries.length !== 1 ? 's' : ''} encontrada{entries.length !== 1 ? 's' : ''}
            {selectedCount !== entries.length && (
              <span className="text-brand-400 ml-1">· {selectedCount} selecionada{selectedCount !== 1 ? 's' : ''}</span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Select all toggle */}
          <button
            onClick={toggleAll}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            {allSelected ? 'Desmarcar todos' : 'Selecionar todos'}
          </button>
        </div>
      </div>

      {/* Track list */}
      <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
        {entries.map((entry, idx) => {
          const isChecked = selected.has(entry.id);
          return (
            <button
              key={entry.id}
              onClick={() => toggleOne(entry.id)}
              className={`w-full flex items-center gap-3 p-2 rounded-lg text-left transition-all duration-150
                ${isChecked
                  ? 'bg-brand-500/10 border border-brand-500/25'
                  : 'bg-surface-3/50 border border-transparent hover:border-white/10'
                }`}
            >
              {/* Checkbox */}
              <div className={`flex-shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center transition-colors
                ${isChecked ? 'bg-brand-500 border-brand-500' : 'border-slate-600'}`}
              >
                {isChecked && (
                  <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/>
                  </svg>
                )}
              </div>

              {/* Index */}
              <span className="flex-shrink-0 w-5 text-right text-xs text-slate-600 font-mono">
                {idx + 1}
              </span>

              {/* Thumbnail */}
              <div className="flex-shrink-0 w-8 h-8 rounded overflow-hidden bg-surface-3">
                {entry.thumbnail ? (
                  <img src={entry.thumbnail} alt="" className="w-full h-full object-cover"
                    onError={(e) => { e.target.style.display = 'none'; }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-base">🎵</div>
                )}
              </div>

              {/* Title */}
              <span className="flex-1 text-xs text-slate-200 truncate">{entry.title}</span>

              {/* Duration */}
              {entry.duration > 0 && (
                <span className="flex-shrink-0 text-xs text-slate-600 font-mono">
                  {formatDuration(entry.duration)}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Footer actions */}
      <div className="flex gap-2 flex-shrink-0">
        <button
          onClick={handleDownloadAll}
          disabled={isQueuing || selectedCount === 0}
          className="btn-primary flex-1 justify-center"
          id="playlist-download-btn"
        >
          {isQueuing ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              Enfileirando…
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
              </svg>
              Baixar {selectedCount} faixa{selectedCount !== 1 ? 's' : ''} 
              ({audioFormat.toUpperCase()}{totalEstimatedMb && totalEstimatedMb > 0 ? ` · ~${totalEstimatedMb} MB` : ''})
            </>
          )}
        </button>
        <button onClick={onDismiss} className="btn-secondary">
          Cancelar
        </button>
      </div>
    </div>
  );
}
