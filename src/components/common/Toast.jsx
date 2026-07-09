// src/components/common/Toast.jsx
//
// Lightweight toast notification system (no external library).
// Usage:
//   import { useToast, ToastContainer } from '@/components/common/Toast';
//   const { toast } = useToast();
//   toast.success('Download concluído!');
//   toast.error('URL inválida.');

import { createContext, useContext, useState, useCallback, useRef } from 'react';

// ── Context ────────────────────────────────────────────────────────────────

const ToastContext = createContext(null);

let toastIdSeq = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef({});

  const dismiss = useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id));
    clearTimeout(timers.current[id]);
    delete timers.current[id];
  }, []);

  const add = useCallback(({ type = 'info', message, duration = 4000 }) => {
    const id = ++toastIdSeq;
    setToasts((t) => [...t, { id, type, message }]);
    timers.current[id] = setTimeout(() => dismiss(id), duration);
    return id;
  }, [dismiss]);

  const toast = {
    success: (msg, opts) => add({ type: 'success', message: msg, ...opts }),
    error:   (msg, opts) => add({ type: 'error',   message: msg, ...opts }),
    info:    (msg, opts) => add({ type: 'info',    message: msg, ...opts }),
    warn:    (msg, opts) => add({ type: 'warn',    message: msg, ...opts }),
  };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

// ── Toast Container ────────────────────────────────────────────────────────

const TYPE_STYLES = {
  success: {
    bar:  'bg-emerald-500',
    icon: '✓',
    cls:  'border-emerald-500/30 text-emerald-100',
  },
  error: {
    bar:  'bg-red-500',
    icon: '✕',
    cls:  'border-red-500/30 text-red-100',
  },
  warn: {
    bar:  'bg-amber-500',
    icon: '!',
    cls:  'border-amber-500/30 text-amber-100',
  },
  info: {
    bar:  'bg-brand-500',
    icon: 'i',
    cls:  'border-brand-500/30 text-brand-100',
  },
};

function ToastContainer({ toasts, onDismiss }) {
  return (
    <div
      className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 max-w-xs w-full no-drag"
      aria-live="polite"
    >
      {toasts.map((t) => {
        const style = TYPE_STYLES[t.type] ?? TYPE_STYLES.info;
        return (
          <div
            key={t.id}
            className={`glass border animate-slide-up flex items-start gap-3 p-3.5 pr-4 ${style.cls}`}
            role="alert"
          >
            {/* Type indicator bar */}
            <div className={`mt-0.5 w-1 self-stretch rounded-full ${style.bar} flex-shrink-0`} />

            {/* Icon */}
            <span className={`flex-shrink-0 w-5 h-5 rounded-full ${style.bar} flex items-center justify-center text-white text-xs font-bold`}>
              {style.icon}
            </span>

            {/* Message */}
            <p className="flex-1 text-sm leading-snug">{t.message}</p>

            {/* Dismiss */}
            <button
              onClick={() => onDismiss(t.id)}
              className="flex-shrink-0 text-white/40 hover:text-white transition-colors text-lg leading-none mt-0.5"
              aria-label="Fechar"
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
