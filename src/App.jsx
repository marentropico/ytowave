// src/App.jsx — Main application shell

import { useEffect, useState } from 'react';
import { UrlInput }     from './components/UrlInput/UrlInput';
import { QueuePanel }   from './components/DownloadQueue/QueuePanel';
import { useToast }     from './components/common/Toast';
import { useDownloadStore } from './store/downloadStore';
import { useDownloadEvents } from './hooks/useDownloadEvents';
import { electronApi }  from './services/electronApi';

// ─── Custom Window Titlebar (Windows frameless) ────────────────────────────

function TitleBar() {
  // Only shown on win32 frameless windows
  const isWin = navigator.userAgent.includes('Windows');
  if (!isWin) return null;

  return (
    <div className="drag-area h-9 flex items-center justify-between px-4 bg-surface-1 border-b border-white/5 flex-shrink-0 select-none">
      {/* App name */}
      <div className="flex items-center gap-2 no-drag">
        <WaveIcon className="w-4 h-4 text-brand-400" />
        <span className="text-xs font-semibold gradient-text">YtoWave</span>
      </div>

      {/* Spacer — draggable area */}
      <div className="flex-1" />

      {/* Window controls */}
      <div className="flex no-drag">
        {/* These are cosmetic; real window controls are managed by OS/Electron */}
      </div>
    </div>
  );
}

// ─── Binary Health Banner ─────────────────────────────────────────────────

function BinaryWarningBanner({ binaries }) {
  const missing = Object.entries(binaries)
    .filter(([, v]) => !v.ok)
    .map(([k]) => k);

  if (missing.length === 0) return null;

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 bg-amber-500/10 border-b border-amber-500/20 text-amber-300 text-xs flex-shrink-0">
      <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd"/>
      </svg>
      <span>
        <strong>Binário(s) não encontrado(s):</strong> {missing.join(', ')}.
        Execute <code className="font-mono bg-amber-500/20 px-1 rounded">npm install</code> para baixar automaticamente.
      </span>
    </div>
  );
}

// ─── Settings Panel ───────────────────────────────────────────────────────

function SettingsPanel({ onClose }) {
  const { toast }      = useToast();
  const outputDir      = useDownloadStore((s) => s.outputDir);
  const audioFormat    = useDownloadStore((s) => s.audioFormat);
  const audioQuality   = useDownloadStore((s) => s.audioQuality);
  const setOutputDir   = useDownloadStore((s) => s.setOutputDir);
  const setAudioConfig = useDownloadStore((s) => s.setAudioConfig);
  const [displayDir, setDisplayDir] = useState(outputDir || '~/Music/YtoWave (padrão)');

  async function handleChooseDir() {
    const result = await electronApi.chooseOutputDir();
    if (result.success) {
      setOutputDir(result.path);
      setDisplayDir(result.path);
      toast.success('Pasta de destino atualizada.');
    }
  }

  const FORMAT_OPTIONS = [
    { id: 'wav', label: 'WAV', desc: 'Sem perdas, descomprimido', qualities: [{ id: '24', label: '24-bit Studio' }, { id: '16', label: '16-bit CD' }] },
    { id: 'flac', label: 'FLAC', desc: 'Sem perdas, comprimido', qualities: [{ id: '24', label: '24-bit Studio' }, { id: '16', label: '16-bit CD' }] },
    { id: 'mp3', label: 'MP3', desc: 'Com perdas, leve', qualities: [{ id: '320', label: '320 kbps (Alto)' }, { id: '192', label: '192 kbps (Padrão)' }] },
  ];

  const currentFormatDef = FORMAT_OPTIONS.find(f => f.id === audioFormat) || FORMAT_OPTIONS[0];

  return (
    <div className="glass animate-slide-up p-5 flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-white">Configurações</h3>
        <button onClick={onClose} className="btn-icon">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>

      {/* Output directory */}
      <div>
        <label className="block text-xs font-medium text-slate-400 mb-1.5">
          Pasta de destino
        </label>
        <div className="flex gap-2">
          <div className="flex-1 input-field text-slate-400 text-xs truncate flex items-center">
            {displayDir}
          </div>
          <button onClick={handleChooseDir} className="btn-secondary text-xs whitespace-nowrap">
            Escolher…
          </button>
        </div>
      </div>

      {/* Audio Format & Quality */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Format Selector */}
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">
            Formato de Áudio
          </label>
          <div className="flex flex-col gap-2">
            {FORMAT_OPTIONS.map((fmt) => (
              <button
                key={fmt.id}
                onClick={() => setAudioConfig(fmt.id, fmt.qualities[0].id)}
                className={`flex items-center justify-between p-2 rounded-lg text-sm font-semibold border transition-all duration-200
                  ${audioFormat === fmt.id
                    ? 'bg-brand-500/20 border-brand-500/50 text-brand-300'
                    : 'bg-surface-3 border-white/10 text-slate-400 hover:border-brand-500/30'
                  }`}
              >
                <span>{fmt.label}</span>
                <span className="text-xs font-normal opacity-60">{fmt.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Quality Selector */}
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">
            Qualidade
          </label>
          <div className="flex flex-col gap-2">
            {currentFormatDef.qualities.map((q) => (
              <button
                key={q.id}
                onClick={() => setAudioConfig(audioFormat, q.id)}
                className={`flex items-center justify-center p-2 rounded-lg text-sm font-semibold border transition-all duration-200 h-[38px]
                  ${audioQuality === q.id
                    ? 'bg-brand-500/20 border-brand-500/50 text-brand-300'
                    : 'bg-surface-3 border-white/10 text-slate-400 hover:border-brand-500/30'
                  }`}
              >
                {q.label}
              </button>
            ))}
          </div>
          {audioFormat === 'wav' && audioQuality === '24' && (
             <div className="mt-2 text-[10px] text-emerald-400/80 font-medium">
               Recomendado para máxima qualidade (Lossless Master)
             </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Sidebar Stats ────────────────────────────────────────────────────────

function SidebarStats() {
  const queue      = useDownloadStore((s) => s.queue);
  const activeCount = queue.filter((i) =>
    ['fetching','downloading','converting','embedding'].includes(i.status)
  ).length;
  const doneCount  = queue.filter((i) => i.status === 'done').length;

  return (
    <div className="flex items-center gap-4 text-xs text-slate-500">
      <span>
        <span className={`font-semibold ${activeCount > 0 ? 'text-brand-400' : 'text-slate-600'}`}>
          {activeCount}
        </span> ativos
      </span>
      <span>
        <span className={`font-semibold ${doneCount > 0 ? 'text-emerald-400' : 'text-slate-600'}`}>
          {doneCount}
        </span> concluídos
      </span>
    </div>
  );
}

// ─── Wave Icon ────────────────────────────────────────────────────────────

function WaveIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M9 19V6l2 5 2-5 2 7 2-5v13M3 12h2m14 0h2"/>
    </svg>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────

export default function App() {
  const { toast }      = useToast();
  const binariesOk     = useDownloadStore((s) => s.binariesOk);
  const setBinariesOk  = useDownloadStore((s) => s.setBinariesOk);
  const audioFormat    = useDownloadStore((s) => s.audioFormat);
  const [showSettings, setShowSettings] = useState(false);

  // Wire IPC events → store
  useDownloadEvents();

  // Check binaries on mount
  useEffect(() => {
    if (!electronApi.isElectron()) return;
    electronApi.checkBinaries().then(setBinariesOk).catch(() => {});
  }, [setBinariesOk]);

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-surface bg-gradient-dark-mesh">
      {/* Frameless titlebar (Windows only) */}
      <TitleBar />

      {/* Binary warning */}
      {binariesOk && <BinaryWarningBanner binaries={binariesOk} />}

      {/* Main layout */}
      <div className="flex-1 flex flex-col min-h-0 p-5 gap-4">

        {/* Header */}
        <div className="flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            {/* Logo */}
            <div className="p-2 rounded-xl bg-gradient-brand shadow-brand-sm animate-glow">
              <WaveIcon className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold gradient-text tracking-tight">YtoWave</h1>
              <p className="text-xs text-slate-500 leading-none">Music Downloader · {audioFormat.toUpperCase()} Quality</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <SidebarStats />
            <button
              onClick={() => setShowSettings((s) => !s)}
              className={`btn-icon ${showSettings ? 'bg-surface-3 text-brand-400' : ''}`}
              title="Configurações"
              aria-label="Abrir configurações"
              id="settings-btn"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Settings panel (inline, collapsible) */}
        {showSettings && (
          <div className="flex-shrink-0">
            <SettingsPanel onClose={() => setShowSettings(false)} />
          </div>
        )}

        {/* URL Input section */}
        <div className="glass p-4 flex-shrink-0">
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
            Novo Download
          </label>
          <UrlInput />
        </div>

        {/* Download Queue — fills remaining height */}
        <div className="glass p-4 flex-1 min-h-0 flex flex-col">
          <QueuePanel />
        </div>

      </div>
    </div>
  );
}
