// src/components/common/StatusBadge.jsx

const STATUS_MAP = {
  pending: {
    label: 'Na Fila',
    className: 'bg-slate-700/60 text-slate-400 border-slate-600/40',
    dot: 'bg-slate-400',
  },
  skipped: {
    label: 'Ja existe',
    className: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
    dot: 'bg-slate-400',
  },
  fetching: {
    label: 'Buscando...',
    className: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
    dot: 'bg-blue-400 animate-pulse',
  },
  downloading: {
    label: 'Baixando',
    className: 'bg-brand-500/15 text-brand-300 border-brand-500/30',
    dot: 'bg-brand-400 animate-pulse',
  },
  converting: {
    label: 'Convertendo',
    className: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
    dot: 'bg-violet-400 animate-pulse',
  },
  embedding: {
    label: 'Finalizando',
    className: 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30',
    dot: 'bg-fuchsia-400 animate-pulse',
  },
  done: {
    label: 'Concluído',
    className: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    dot: 'bg-emerald-400',
  },
  error: {
    label: 'Erro',
    className: 'bg-red-500/15 text-red-300 border-red-500/30',
    dot: 'bg-red-400',
  },
  cancelled: {
    label: 'Cancelado',
    className: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
    dot: 'bg-orange-400',
  },
};

/**
 * Colored badge showing the current download status.
 * @param {string} status
 */
export function StatusBadge({ status }) {
  const config = STATUS_MAP[status] ?? STATUS_MAP.pending;

  return (
    <span className={`badge border ${config.className}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
}
