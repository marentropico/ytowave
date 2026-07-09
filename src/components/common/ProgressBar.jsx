// src/components/common/ProgressBar.jsx

/**
 * Animated progress bar with gradient fill and glow effect.
 * @param {number}  progress  0-100
 * @param {string}  status    'downloading' | 'converting' | 'embedding' | 'done' | 'error'
 * @param {boolean} animated  pulse animation during active states
 */
export function ProgressBar({ progress = 0, status = 'downloading', animated = true }) {
  const isActive   = ['downloading', 'converting', 'embedding'].includes(status);
  const isDone     = status === 'done';
  const isError    = status === 'error';
  const isPending  = status === 'pending' || status === 'fetching';

  const clampedPct = Math.min(100, Math.max(0, progress));

  const barColor = isError
    ? 'from-red-500 to-red-400'
    : isDone
    ? 'from-emerald-500 to-teal-400'
    : 'from-brand-500 to-accent';

  const glowColor = isError
    ? 'rgba(239,68,68,0.5)'
    : isDone
    ? 'rgba(16,185,129,0.5)'
    : 'rgba(99,102,241,0.6)';

  return (
    <div className="w-full">
      {/* Track */}
      <div className="relative h-1.5 w-full rounded-full bg-surface-3 overflow-hidden">
        {isPending ? (
          /* Skeleton shimmer for pending */
          <div className="absolute inset-0 shimmer rounded-full" />
        ) : (
          /* Progress fill */
          <div
            className={`h-full rounded-full bg-gradient-to-r ${barColor} transition-all duration-500 ease-out`}
            style={{
              width: `${clampedPct}%`,
              boxShadow: isActive && animated
                ? `0 0 8px ${glowColor}, 0 0 16px ${glowColor}`
                : 'none',
            }}
          >
            {/* Shimmer overlay for active state */}
            {isActive && animated && (
              <div className="absolute inset-0 shimmer rounded-full opacity-50" />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
