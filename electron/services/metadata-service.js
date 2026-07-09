/**
 * electron/services/metadata-service.js
 *
 * Uses `yt-dlp --dump-json` to fetch track metadata before download starts.
 * Returns a clean object with title, uploader, thumbnail, duration, etc.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { resolveBinary } = require('./binary-resolver');

// Setup spotify-url-info
const fetch = require('isomorphic-unfetch');
const { getData } = require('spotify-url-info')(fetch);

function isSpotify(url) {
  return url.includes('spotify.com');
}

/**
 * Fetches metadata for a given URL via yt-dlp --dump-json (or spotDL for Spotify).
 *
 * @param {string} url - The media URL to inspect
 * @returns {Promise<Object>} Parsed metadata object
 */
async function fetchMetadata(url) {
  const ytdlpPath = resolveBinary('yt-dlp');

  return new Promise((resolve, reject) => {
    const args = [
      '--dump-json',
      '--no-playlist',   // treat playlist URLs as single video (unless user opts in)
      '--no-warnings',
      url,
    ];

    let rawOutput = '';
    let errorOutput = '';

    const proc = spawn(ytdlpPath, args, { windowsHide: true });

    proc.stdout.on('data', (chunk) => { rawOutput += chunk.toString(); });
    proc.stderr.on('data', (chunk) => { errorOutput += chunk.toString(); });

    proc.on('error', (err) => {
      reject(new Error(`Failed to launch yt-dlp: ${err.message}`));
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        // Parse common error patterns for friendlier messages
        if (errorOutput.includes('Private video'))
          return reject(new Error('Este vídeo é privado e não pode ser acessado.'));
        if (errorOutput.includes('Video unavailable'))
          return reject(new Error('Vídeo indisponível na plataforma.'));
        if (errorOutput.includes('confirm your age'))
          return reject(new Error('Vídeo com restrição de idade — requer login.'));
        if (errorOutput.includes('Unsupported URL'))
          return reject(new Error('URL não suportada. Verifique o endereço.'));

        return reject(new Error(`yt-dlp falhou (código ${code}): ${errorOutput.slice(0, 300)}`));
      }

      try {
        const data = JSON.parse(rawOutput.trim());

        resolve({
          id: data.id,
          title: data.title || 'Sem título',
          uploader: data.uploader || data.channel || data.artist || 'Desconhecido',
          album: data.album || null,
          artist: data.artist || data.uploader || null,
          thumbnail: data.thumbnail || null,
          duration: data.duration || 0,         // seconds
          webpage_url: data.webpage_url || url,
          extractor: data.extractor || '',
          description: data.description || '',
        });
      } catch (parseErr) {
        reject(new Error(`Erro ao processar metadados: ${parseErr.message}`));
      }
    });
  });
}

/**
 * Uses spotify-url-info to fetch Spotify metadata instantly without youtube searching.
 */
async function fetchSpotifyMetadata(url, sender) {
  try {
    if (sender && !sender.isDestroyed()) {
      sender.send('metadata:progress', `Consultando API do Spotify...`);
    }

    const data = await getData(url);
    if (!data) throw new Error('Dados não encontrados no Spotify');

    // Se for playlist/álbum
    if (data.type === 'playlist' || data.type === 'album') {
      const coverArt = data.coverArt?.sources?.[0]?.url || data.visualIdentity?.image?.[0]?.url || null;
      const trackList = data.trackList || [];
      
      if (trackList.length === 0) {
        throw new Error('Nenhuma faixa encontrada na playlist.');
      }

      return trackList.map(track => ({
        id: track.uid || track.uri,
        title: track.title || 'Sem título',
        uploader: track.subtitle || data.title || 'Desconhecido',
        artist: track.subtitle || data.title || 'Desconhecido',
        album: data.title || null,
        thumbnail: coverArt, // usamos a arte da playlist para todas as faixas
        duration: track.duration ? Math.floor(track.duration / 1000) : 0,
        webpage_url: `https://open.spotify.com/track/${track.uri.split(':').pop()}`,
        extractor: 'spotify',
      }));
    } 
    
    // Se for faixa única (track)
    if (data.type === 'track') {
      const coverArt = data.coverArt?.sources?.[0]?.url || data.visualIdentity?.image?.[0]?.url || null;
      const artistName = data.artists?.[0]?.name || data.subtitle || 'Desconhecido';
      return [{
        id: data.id || data.uri,
        title: data.name || data.title || 'Sem título',
        uploader: artistName,
        artist: artistName,
        album: null,
        thumbnail: coverArt,
        duration: data.duration ? Math.floor(data.duration / 1000) : 0,
        webpage_url: url,
        extractor: 'spotify',
      }];
    }

    throw new Error(`Tipo de link Spotify não suportado: ${data.type}`);
  } catch (err) {
    throw new Error(`Erro ao processar metadados do Spotify: ${err.message}`);
  }
}

/**
 * Fetches metadata for a playlist URL, returning an array of entries.
 *
 * @param {string} url - Playlist URL
 * @returns {Promise<Object[]>}
 */
async function fetchPlaylistMetadata(url) {
  const ytdlpPath = resolveBinary('yt-dlp');

  return new Promise((resolve, reject) => {
    const args = [
      '--dump-json',
      '--flat-playlist',
      '--no-warnings',
      url,
    ];

    let rawOutput = '';
    let errorOutput = '';

    const proc = spawn(ytdlpPath, args, { windowsHide: true });

    proc.stdout.on('data', (chunk) => { rawOutput += chunk.toString(); });
    proc.stderr.on('data', (chunk) => { errorOutput += chunk.toString(); });

    proc.on('error', (err) => reject(new Error(`Failed to launch yt-dlp: ${err.message}`)));

    proc.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`yt-dlp falhou (código ${code}): ${errorOutput.slice(0, 300)}`));
      }

      try {
        // Each line is a separate JSON object for flat-playlist
        const entries = rawOutput
          .trim()
          .split('\n')
          .filter(Boolean)
          .map((line) => {
            const d = JSON.parse(line);
            return {
              id: d.id,
              title: d.title || d.id,
              uploader: d.uploader || d.channel || 'Desconhecido',
              thumbnail: d.thumbnail || null,
              duration: d.duration || 0,
              webpage_url: d.url || d.webpage_url,
              extractor: d.ie_key || d.extractor || '',
            };
          });
        resolve(entries);
      } catch (parseErr) {
        reject(new Error(`Erro ao processar playlist: ${parseErr.message}`));
      }
    });
  });
}

// Intercept main exports to route based on URL
async function fetchMetadataRouted(url) {
  if (isSpotify(url)) {
    const entries = await fetchSpotifyMetadata(url);
    return entries[0]; // return first for single metadata
  }
  return fetchMetadata(url);
}

async function fetchPlaylistMetadataRouted(url, sender) {
  if (isSpotify(url)) {
    return await fetchSpotifyMetadata(url, sender); // fetchSpotifyMetadata returns an array of entries
  }
  return fetchPlaylistMetadata(url);
}

module.exports = { 
  fetchMetadata: fetchMetadataRouted, 
  fetchPlaylistMetadata: fetchPlaylistMetadataRouted 
};
