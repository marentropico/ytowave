// src/components/DownloadQueue/QueueItem.jsx
//
// A single item in the download queue. Shows thumbnail, title, progress bar,
// speed/ETA, status badge, and action buttons (cancel / remove / open folder).

import { useState } from 'react';
import { electronApi } from '../../services/electronApi';
import { useDownloadStore } from '../../store/downloadStore';
import { ProgressBar } from '../common/ProgressBar';
import { StatusBadge } from '../common/StatusBadge';
import { useToast } from '../common/Toast';

function formatDuration(sec) {
  if (!sec) return '';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * @param {{ item: Object }} props
 */
export function QueueItem({ item }) {
  const removeFromQueue = useDownloadStore((s) => s.removeFromQueue);
  const outputDir       = useDownloadStore((s) => s.outputDir);
  const audioFormat     = useDownloadStore((s) => s.audioFormat);
  const updateItem      = useDownloadStore((s) => s.updateItem);
  const audioQuality    = useDownloadStore((s) => s.audioQuality);
  const addAlternativeUrl = useDownloadStore((s) => s.addAlternativeUrl);
  const setActiveUrl    = useDownloadStore((s) => s.setActiveUrl);
  const { toast }       = useToast();

  const [showLinkPool, setShowLinkPool] = useState(false);
  const [newAltUrl, setNewAltUrl] = useState('');

  const isActive    = ['fetching','downloading','converting','embedding'].includes(item.status);
  const isDone      = item.status === 'done';
  const isSkipped   = item.status === 'skipped';
  const isError     = item.status === 'error';
  const isCancelled = item.status === 'cancelled';
  const removable   = isDone || isSkipped || isError || isCancelled;

  function handleCancel() {
    electronApi.cancelDownload(item.id);
  }

  function handleRemove() {
    removeFromQueue(item.id);
  }

  function handleOpenFolder() {
    electronApi.openOutputDir(outputDir || undefined);
  }

  async function handleRetry() {
    try {
      updateItem(item.id, { status: 'downloading', progress: 0, error: null, speed: '', eta: '' });
      const result = await electronApi.startDownload(item, {
        outputDir:     outputDir || undefined,
        audioFormat,
        audioQuality,
      });
      if (!result.success) {
        updateItem(item.id, { status: 'error', error: result.error });
        toast.error(`Erro ao baixar: ${result.error}`);
      }
    } catch (err) {
      updateItem(item.id, { status: 'error', error: err.message });
      toast.error(`Erro: ${err.message}`);
    }
  }

  return (
    <div
      className={`glass-hover p-4 flex gap-4 items-start transition-all duration-300 animate-fade-in
        ${isDone ? 'border-emerald-500/20' : ''}
        ${isError ? 'border-red-500/20' : ''}
      `}
    >
      {/* Thumbnail */}
      <div className="flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden bg-surface-3 relative">
        {item.thumbnail ? (
          <img
            src={item.thumbnail}
            alt={item.title}
            className="w-full h-full object-cover"
            onError={(e) => { e.target.style.display = 'none'; }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-2xl">
            🎵
          </div>
        )}

        {/* Done overlay */}
        {isDone && (
          <div className="absolute inset-0 bg-emerald-500/20 flex items-center justify-center">
            <svg className="w-6 h-6 text-emerald-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/>
            </svg>
          </div>
        )}
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        {/* Title & badge */}
        <div className="flex items-start gap-2 justify-between">
          <div className="min-w-0">
            <h4 className="font-medium text-sm text-white leading-snug truncate" title={item.title}>
              {item.title}
            </h4>
            <p className="text-xs text-slate-500 mt-0.5 truncate">
              {item.uploader}
              {item.duration ? ` · ${formatDuration(item.duration)}` : ''}
            </p>
          </div>
          <StatusBadge status={item.status} />
        </div>

        {/* Progress bar */}
        <div className="mt-3">
          <ProgressBar progress={item.progress} status={item.status} />
        </div>

        {/* Stats row */}
        <div className="flex items-center justify-between mt-1.5">
          <div className="flex items-center gap-3 text-xs text-slate-500 font-mono">
            {isActive && (
              <>
                {item.progress > 0 && (
                  <span className="text-brand-300/80">{item.progress.toFixed(1)}%</span>
                )}
                {item.speed && <span>{item.speed}</span>}
                {item.eta && item.eta !== '00:00' && (
                  <span className="text-slate-600">ETA {item.eta}</span>
                )}
              </>
            )}
            {isError && (
              <span className="text-red-400 text-xs not-italic font-sans truncate max-w-[280px]">
                {item.error}
              </span>
            )}
            {isDone && (
              <span className="text-emerald-400/70 text-xs font-sans">
                {audioFormat.toUpperCase()} salvo com sucesso
              </span>
            )}
            {isSkipped && (
              <span className="text-slate-400/70 text-xs font-sans flex items-center gap-1">
                <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                Arquivo ja existe no destino — ignorado
              </span>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {isDone && (
              <button
                onClick={handleOpenFolder}
                className="btn-icon text-emerald-400 hover:text-emerald-300"
                title="Abrir pasta"
                aria-label="Abrir pasta de destino"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/>
                </svg>
              </button>
            )}

            {isActive && (
              <button
                onClick={handleCancel}
                className="btn-icon text-slate-500 hover:text-red-400"
                title="Cancelar download"
                aria-label="Cancelar"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            )}

            {isError && (
              <button
                onClick={() => setShowLinkPool(!showLinkPool)}
                className={`btn-icon ${showLinkPool ? 'text-brand-400 bg-surface-3' : 'text-slate-400 hover:text-slate-200'}`}
                title="Pool de Links"
                aria-label="Pool de Links"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/>
                </svg>
              </button>
            )}

            {isError && (
              <button
                onClick={handleRetry}
                className="btn-icon text-brand-400 hover:text-brand-300"
                title="Tentar novamente"
                aria-label="Tentar novamente"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 7.89"/>
                </svg>
              </button>
            )}

            {removable && (
              <button
                onClick={handleRemove}
                className="btn-icon text-slate-500 hover:text-slate-300"
                title="Remover da lista"
                aria-label="Remover"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                </svg>
              </button>
            )}
          </div>
        </div>

        {showLinkPool && (
          <div className="mt-3 pt-3 border-t border-white/5 w-full flex flex-col gap-2 animate-slide-up">
            <div className="text-[10px] font-bold text-slate-400 flex justify-between items-center tracking-wide uppercase">
              <span>Pool de Links (Alternativos)</span>
              <span className="text-[10px] text-slate-500 font-mono">Total: {item.urlPool?.length || 1}</span>
            </div>

            {/* List of current links in the pool */}
            <div className="flex flex-col gap-1.5 max-h-24 overflow-y-auto pr-1">
              {(item.urlPool || [item.originalUrl || item.url]).map((u, index) => {
                const isActiveUrl = item.url === u;
                return (
                  <div key={index} className={`flex items-center justify-between gap-2 p-1.5 rounded text-[11px] bg-surface-3 border ${isActiveUrl ? 'border-brand-500/50 bg-brand-500/5' : 'border-transparent'}`}>
                    <span className="truncate text-slate-300 select-all max-w-[340px] font-mono" title={u}>
                      {u}
                    </span>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {isActiveUrl ? (
                        <span className="text-[9px] bg-brand-500/20 text-brand-300 px-1.5 py-0.5 rounded font-medium">Ativo</span>
                      ) : (
                        <button
                          onClick={() => {
                            setActiveUrl(item.id, u);
                            toast.success('Link alternativo ativado!');
                          }}
                          className="text-[9px] text-brand-400 hover:text-brand-300 font-semibold transition-colors"
                        >
                          Usar
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Add alternative URL input */}
            <div className="flex gap-2 mt-1">
              <input
                type="text"
                value={newAltUrl}
                onChange={(e) => setNewAltUrl(e.target.value)}
                placeholder="Cole um link alternativo do YouTube..."
                className="flex-1 px-3 py-2 rounded text-xs bg-surface-4 border border-white/5 text-white placeholder:text-slate-600 outline-none focus:border-brand-500/50"
              />
              <button
                onClick={() => {
                  if (newAltUrl.trim()) {
                    addAlternativeUrl(item.id, newAltUrl);
                    setNewAltUrl('');
                    toast.success('Link alternativo adicionado e ativado!');
                  }
                }}
                className="px-3.5 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded text-xs font-semibold transition-colors"
              >
                Adicionar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
