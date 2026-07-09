// src/components/UrlInput/MetadataPreview.jsx
//
// Shows a preview card of fetched metadata (thumbnail, title, uploader)
// before the user confirms the download.

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
 * @param {Object}   metadata  - Fetched metadata object
 * @param {string}   url       - Original URL
 * @param {Function} onConfirm - Called after download is queued
 * @param {Function} onDismiss - Called to dismiss the preview
 */
export function MetadataPreview({ metadata, url, onConfirm, onDismiss }) {
  const { toast } = useToast();
  const addToQueue = useDownloadStore((s) => s.addToQueue);
  const outputDir  = useDownloadStore((s) => s.outputDir);
  const audioFormat  = useDownloadStore((s) => s.audioFormat);
  const audioQuality = useDownloadStore((s) => s.audioQuality);
  const updateItem = useDownloadStore((s) => s.updateItem);
  const getEstimatedSize = useDownloadStore((s) => s.getEstimatedSize);

  async function handleDownload() {
    const item = addToQueue(metadata, url);
    onConfirm();

    try {
      // Mark as downloading immediately
      updateItem(item.id, { status: 'downloading' });

      const result = await electronApi.startDownload(item, {
        outputDir:     outputDir || undefined,
        audioFormat,
        audioQuality,
      });

      if (!result.success) {
        updateItem(item.id, { status: 'error', error: result.error });
        toast.error(`Erro: ${result.error}`);
      }
    } catch (err) {
      updateItem(item.id, { status: 'error', error: err.message });
      toast.error(`Erro inesperado: ${err.message}`);
    }
  }

  return (
    <div className="glass animate-slide-up p-4 flex gap-4 items-start">
      {/* Thumbnail */}
      <div className="flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden bg-surface-3 relative">
        {metadata.thumbnail ? (
          <img
            src={metadata.thumbnail}
            alt={metadata.title}
            className="w-full h-full object-cover"
            onError={(e) => { e.target.style.display = 'none'; }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-500 text-3xl">
            🎵
          </div>
        )}
        {/* WAV badge overlay */}
        <span className="absolute bottom-1 right-1 bg-black/70 text-brand-300 text-[9px] font-bold px-1 rounded uppercase">
          {audioFormat}
        </span>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-sm text-white truncate leading-snug" title={metadata.title}>
          {metadata.title}
        </h3>
        <p className="text-xs text-slate-400 mt-0.5 truncate">
          {metadata.uploader}
          {metadata.duration ? ` · ${formatDuration(metadata.duration)}` : ''}
          {metadata.duration ? ` · ~${getEstimatedSize(metadata.duration)} MB` : ''}
        </p>

        <div className="flex items-center gap-2 mt-1.5">
          <span className="badge bg-brand-500/15 text-brand-300 border border-brand-500/20 text-[10px] uppercase">
            {audioFormat === 'mp3' ? `${audioQuality} kbps` : `${audioQuality}-bit / 48kHz`}
          </span>
          {metadata.extractor && (
            <span className="badge bg-surface-3 text-slate-400 border border-white/5 text-[10px]">
              {metadata.extractor}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-2 flex-shrink-0">
        <button onClick={handleDownload} className="btn-primary text-xs py-2 px-4">
          ↓ Baixar
        </button>
        <button onClick={onDismiss} className="btn-secondary text-xs py-1.5 px-3 justify-center">
          Cancelar
        </button>
      </div>
    </div>
  );
}
