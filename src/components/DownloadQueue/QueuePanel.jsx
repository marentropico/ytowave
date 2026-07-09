// src/components/DownloadQueue/QueuePanel.jsx
//
// The scrollable panel that renders all items in the download queue.

import { useDownloadStore } from '../../store/downloadStore';
import { QueueItem } from './QueueItem';

export function QueuePanel() {
  const queue         = useDownloadStore((s) => s.queue);
  const clearCompleted = useDownloadStore((s) => s.clearCompleted);
  const clearAll      = useDownloadStore((s) => s.clearAll);

  const hasCompleted = queue.some((i) => ['done', 'error', 'cancelled'].includes(i.status));
  const isEmpty      = queue.length === 0;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Panel header */}
      <div className="flex items-center justify-between px-1 mb-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-white">Fila de Downloads</h2>
          {queue.length > 0 && (
            <span className="badge bg-surface-3 text-slate-400 border border-white/5">
              {queue.length}
            </span>
          )}
        </div>

        {/* Bulk actions */}
        {queue.length > 0 && (
          <div className="flex gap-2">
            {hasCompleted && (
              <button
                onClick={clearCompleted}
                className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
              >
                Limpar concluídos
              </button>
            )}
            <button
              onClick={clearAll}
              className="text-xs text-red-500/60 hover:text-red-400 transition-colors"
            >
              Limpar tudo
            </button>
          </div>
        )}
      </div>

      {/* Queue list */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-0.5">
        {isEmpty ? (
          <EmptyState />
        ) : (
          queue.map((item) => <QueueItem key={item.id} item={item} />)
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 py-16 text-center animate-fade-in">
      {/* Animated waveform icon */}
      <div className="flex items-end gap-1 h-12">
        {[3, 6, 9, 5, 8, 4, 7, 5, 9, 3].map((h, i) => (
          <div
            key={i}
            className="w-1.5 rounded-full bg-gradient-brand opacity-30"
            style={{
              height: `${h * 4}px`,
              animation: `pulse ${1 + i * 0.15}s ease-in-out infinite alternate`,
            }}
          />
        ))}
      </div>

      <div>
        <p className="text-slate-400 font-medium text-sm">Nenhum download na fila</p>
        <p className="text-slate-600 text-xs mt-1">
          Cole uma URL acima para começar
        </p>
      </div>
    </div>
  );
}
