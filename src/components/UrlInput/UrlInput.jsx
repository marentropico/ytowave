// src/components/UrlInput/UrlInput.jsx
//
// The main input panel. User pastes URL → app detects if it's a playlist or
// single track → fetches metadata → shows preview.

import { useState, useRef, useEffect } from 'react';
import { electronApi } from '../../services/electronApi';
import { useToast } from '../common/Toast';
import { MetadataPreview } from './MetadataPreview';
import { PlaylistPreview } from './PlaylistPreview';

function isValidUrl(str) {
  try { new URL(str); return true; } catch { return false; }
}

/**
 * Sanitizes URLs by removing tracking parameters.
 */
function cleanUrl(rawUrl) {
  try {
    const urlObj = new URL(rawUrl);
    const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'si', 'pi', 'nd', 'dlsi', 'fbclid', 'igshid'];
    trackingParams.forEach(param => urlObj.searchParams.delete(param));
    return urlObj.toString();
  } catch {
    return rawUrl;
  }
}

/**
 * Detects if a URL points to a playlist.
 * YouTube: any URL with ?list= is a playlist (even if ?v= is also present —
 * that just means "this video inside this playlist", but the list is still there).
 * SoundCloud: /sets/
 * Generic: /playlist path
 */
function isPlaylistUrl(url) {
  try {
    const u = new URL(url);
    // YouTube: list= param present → it's a playlist
    if (u.searchParams.has('list')) return true;
    // SoundCloud sets
    if (u.pathname.includes('/sets/')) return true;
    // Generic /playlist path (YouTube Music, Spotify, etc.)
    if (u.pathname.includes('/playlist')) return true;
    // Spotify albums
    if (u.pathname.includes('/album')) return true;
    return false;
  } catch {
    return false;
  }
}

export function UrlInput() {
  const { toast } = useToast();

  const [url, setUrl]               = useState('');
  const [fetching, setFetching]     = useState(false);
  const [metadata, setMetadata]     = useState(null);      // single track
  const [playlist, setPlaylist]     = useState(null);      // playlist entries[]
  const [error, setError]           = useState('');
  const [progressText, setProgressText] = useState('');
  const inputRef                    = useRef(null);

  useEffect(() => {
    return electronApi.onMetadataProgress((msg) => {
      setProgressText(msg);
    });
  }, []);

  async function handleFetch(overrideUrl) {
    let trimmed = (overrideUrl || url).trim();
    if (trimmed) {
      trimmed = cleanUrl(trimmed);
      setUrl(trimmed);
    }

    if (!trimmed) {
      setError('Cole uma URL válida antes de continuar.');
      return;
    }
    if (!isValidUrl(trimmed)) {
      setError('URL inválida. Verifique o endereço e tente novamente.');
      return;
    }

    setError('');
    setFetching(true);
    setProgressText('');
    setMetadata(null);
    setPlaylist(null);

    const looksLikePlaylist = isPlaylistUrl(trimmed);

    try {
      if (looksLikePlaylist) {
        // Try to fetch as playlist
        const result = await electronApi.fetchPlaylistMetadata(trimmed);
        if (!result.success) {
          // Fallback: try single track
          const single = await electronApi.fetchMetadata(trimmed);
          if (!single.success) {
            setError(single.error || 'Falha ao buscar metadados.');
          } else {
            setMetadata(single.data);
          }
        } else if (result.data.length === 1) {
          // Single-item "playlist" — treat as single track
          setMetadata(result.data[0]);
        } else {
          setPlaylist(result.data);
        }
      } else {
        const result = await electronApi.fetchMetadata(trimmed);
        if (!result.success) {
          setError(result.error || 'Falha ao buscar metadados.');
        } else {
          setMetadata(result.data);
        }
      }
    } catch (err) {
      setError(`Erro: ${err.message}`);
    } finally {
      setFetching(false);
      setProgressText('');
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') handleFetch();
  }

  function handlePaste(e) {
    const pasted = e.clipboardData.getData('text').trim();
    if (!url && pasted && isValidUrl(pasted)) {
      setUrl(pasted);
      setTimeout(() => handleFetch(pasted), 50);
    }
  }

  function handleClear() {
    setUrl('');
    setMetadata(null);
    setPlaylist(null);
    setError('');
    inputRef.current?.focus();
  }

  function handleConfirmSingle() {
    handleClear();
    toast.success('Adicionado à fila de downloads!');
  }

  function handleConfirmPlaylist(count) {
    handleClear();
    toast.success(`${count} faixa${count !== 1 ? 's' : ''} adicionada${count !== 1 ? 's' : ''} à fila!`);
  }

  function handleDismiss() {
    setMetadata(null);
    setPlaylist(null);
    setError('');
  }

  const hasPreview = metadata || playlist;

  return (
    <div className="flex flex-col gap-3">
      {/* URL Input row */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <input
            ref={inputRef}
            type="url"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setError('');
              if (!e.target.value) { setMetadata(null); setPlaylist(null); }
            }}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder="Cole o link: vídeo, música ou playlist do YouTube, SoundCloud…"
            className={`input-field pr-10 ${error ? 'border-red-500/60 focus:border-red-500/80' : ''}`}
            disabled={fetching}
            aria-label="URL para download"
            id="url-input"
            autoComplete="off"
            spellCheck={false}
          />
          {url && !fetching && (
            <button
              onClick={handleClear}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors text-lg"
              aria-label="Limpar"
            >
              ×
            </button>
          )}
        </div>

        <button
          onClick={() => handleFetch()}
          disabled={fetching || !url.trim()}
          className="btn-primary min-w-[120px] justify-center"
          id="fetch-btn"
        >
          {fetching ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              {progressText ? progressText : (isPlaylistUrl(url) ? 'Carregando…' : 'Buscando…')}
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
              </svg>
              Analisar
            </>
          )}
        </button>
      </div>

      {/* Playlist hint badge */}
      {url && isPlaylistUrl(url) && !hasPreview && !fetching && (
        <div className="flex items-center gap-1.5 text-xs text-brand-300/80 animate-fade-in">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 6h16M4 10h16M4 14h10M4 18h10"/>
          </svg>
          Playlist detectada — todas as faixas serão listadas
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="flex items-center gap-2 text-sm text-red-300 animate-fade-in">
          <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"/>
          </svg>
          {error}
        </div>
      )}

      {/* Single track preview */}
      {metadata && (
        <MetadataPreview
          metadata={metadata}
          url={url}
          onConfirm={handleConfirmSingle}
          onDismiss={handleDismiss}
        />
      )}

      {/* Playlist preview */}
      {playlist && (
        <PlaylistPreview
          entries={playlist}
          url={url}
          onConfirm={handleConfirmPlaylist}
          onDismiss={handleDismiss}
        />
      )}
    </div>
  );
}
