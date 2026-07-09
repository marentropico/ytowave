/**
 * electron/services/download-service.js
 *
 * Core download engine. Manages the download queue, spawns yt-dlp processes,
 * parses real-time progress from stdout, and emits IPC events back to the renderer.
 *
 * Audio pipeline:
 *   yt-dlp -x --audio-format wav --audio-quality 0 --add-metadata [URL]
 *
 * Exit code note: yt-dlp exits with code 1 on WARNING-only runs (JS runtime
 * warning). We detect true success/skip by inspecting stdout markers.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { resolveBinary } = require('./binary-resolver');

const activeProcesses = new Map();
const DEFAULT_OUT_DIR = path.join(os.homedir(), 'Music', 'YtoWave');

function isSpotify(url) {
  return url.includes('spotify.com');
}

async function startDownload(item, sender, options = {}) {
  const { id, url } = item;
  const audioFormat = options.audioFormat || 'wav';
  const audioQuality = options.audioQuality || '24';
  const outputDir = options.outputDir || DEFAULT_OUT_DIR;

  let binPath;
  let args = [];

  const ffmpegPath = resolveBinary('ffmpeg');
  const ffmpegDir = path.dirname(ffmpegPath);

  if (isSpotify(url)) {
    // Ensure spotDL config disables lyrics to prevent hangs
    const spotdlDir = path.join(os.homedir(), '.spotdl');
    const spotdlConfigPath = path.join(spotdlDir, 'config.json');
    if (!fs.existsSync(spotdlDir)) fs.mkdirSync(spotdlDir, { recursive: true });
    
    let config = {};
    if (fs.existsSync(spotdlConfigPath)) {
      try {
        config = JSON.parse(fs.readFileSync(spotdlConfigPath, 'utf8'));
      } catch (e) { /* ignore parse error */ }
    }
    config.lyrics_providers = [];
    fs.writeFileSync(spotdlConfigPath, JSON.stringify(config, null, 2));

    binPath = resolveBinary('spotdl');
    const spotdlOutputTemplate = path.join(outputDir, '{title}.{output-ext}');
    
    args = [
      url,
      '--format', audioFormat,
      '--output', spotdlOutputTemplate,
      '--ffmpeg', ffmpegPath,
      '--overwrite', 'skip', // skip if exists
    ];

    if (audioFormat === 'mp3') {
      args.push('--bitrate', `${audioQuality}k`);
    } else {
      args.push('--bitrate', 'disable'); // spotdl default for lossless
    }
    
  } else {
    binPath = resolveBinary('yt-dlp');
    const sanitizedTitle = item.title ? item.title.replace(/[\/\\:\*\?"<>\|]/g, '') : '%(title)s';
    const outputTemplate = path.join(outputDir, `${sanitizedTitle}.%(ext)s`);

    args = [
      '--no-playlist',
      '--extract-audio',
      '--audio-format', audioFormat,
    ];

    if (audioFormat === 'mp3') {
      args.push('--audio-quality', `${audioQuality}K`);
    } else if (audioFormat === 'wav' || audioFormat === 'flac') {
      args.push('--audio-quality', '0');
      const bitDepth = audioQuality === '24' ? 's24le' : 's16le';
      if (audioFormat === 'wav') {
         args.push('--postprocessor-args', `ExtractAudio+ffmpeg:-c:a pcm_${bitDepth}`);
      } else {
         const sampleFmt = audioQuality === '24' ? 's32' : 's16'; 
         args.push('--postprocessor-args', `ExtractAudio+ffmpeg:-sample_fmt ${sampleFmt}`);
      }
    }

    args.push('--add-metadata');
    if (audioFormat === 'mp3' || audioFormat === 'flac') {
      args.push('--embed-thumbnail');
    }

    // Apply custom metadata if present
    if (item.title) {
      args.push('--parse-metadata', ` ${item.title}: (?P<meta_title>.+)`);
    }
    if (item.artist) {
      args.push('--parse-metadata', ` ${item.artist}: (?P<meta_artist>.+)`);
    } else {
      args.push('--parse-metadata', '%(artist|uploader)s:%(meta_artist)s');
    }
    if (item.album) {
      args.push('--parse-metadata', ` ${item.album}: (?P<meta_album>.+)`);
    }

    args.push(
      '--parse-metadata', 'upload_date:(?P<meta_date>^[0-9]{4})',
      '--no-overwrites',
      '--ffmpeg-location', ffmpegDir,
      '--output', outputTemplate,
      '--newline',
      '--progress',
      url,
    );
  }

  emitStatus(sender, id, { status: 'downloading', progress: 0, speed: '', eta: '' });

  return new Promise((resolve, reject) => {
    const proc = spawn(binPath, args, { windowsHide: true });
    activeProcesses.set(id, proc);

    const stdoutLines = [];
    const stderrChunks = [];
    let spotdlSkip = false;

    proc.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      const lines = text.split('\n');
      for (const line of lines) {
        stdoutLines.push(line);
        if (isSpotify(url)) {
          // spotdl uses tqdm in stdout. We just emit downloading.
          if (line.includes('100%')) emitStatus(sender, id, { status: 'converting', progress: 99 });
          else if (line.includes('%')) emitStatus(sender, id, { status: 'downloading', progress: 50 }); // generic
          // spotdl skip detection
          if (line.toLowerCase().includes('already exists') || line.toLowerCase().includes('skipping')) spotdlSkip = true;
        } else {
          parseAndEmitProgress(line, id, sender);
        }
      }
    });

    proc.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderrChunks.push(text);
      if (isSpotify(url)) {
        if (text.toLowerCase().includes('already exists') || text.toLowerCase().includes('skipping')) {
          spotdlSkip = true;
        }
      }
      parseFfmpegProgress(text, id, sender);
    });

    proc.on('error', (err) => {
      activeProcesses.delete(id);
      emitStatus(sender, id, { status: 'error', error: `Falha ao iniciar yt-dlp: ${err.message}` });
      reject(err);
    });

    proc.on('close', (code) => {
      activeProcesses.delete(id);

      const fullStdout = stdoutLines.join('\n');
      const fullStderr = stderrChunks.join('');

      if (code === null) {
        emitStatus(sender, id, { status: 'cancelled' });
        return resolve();
      }

      // Detect file-already-exists skip (--no-overwrites or spotdl skip)
      const wasSkipped =
        spotdlSkip ||
        fullStdout.includes('has already been downloaded') ||
        fullStderr.includes('has already been downloaded');

      if (wasSkipped) {
        emitStatus(sender, id, {
          status: 'skipped',
          progress: 100,
          skipReason: 'Arquivo ja existe no diretorio de destino — ignorado.',
        });
        return resolve();
      }

      // Detect successful completion via post-processing stdout markers
      const completedOk =
        fullStdout.includes('[Metadata]')           ||
        fullStdout.includes('[ExtractAudio]')        ||
        fullStdout.includes('[FFmpegExtractAudio]')  ||
        (isSpotify(url) && (code === 0)) || // Spotdl exits with 0 on success
        (fullStdout.includes('[download] 100%') && (code === 0 || code === 1));

      if (code === 0 || (code === 1 && completedOk)) {
        // Double check if the file actually exists on disk in the output directory
        const normalizeTitle = (str) => str.toLowerCase().replace(/[^a-z0-9]/g, '');
        const normTitle = normalizeTitle(item.title);
        const checkFileExists = () => {
          if (!fs.existsSync(outputDir)) return false;
          try {
            const files = fs.readdirSync(outputDir);
            return files.some(f => {
              const normFile = normalizeTitle(path.parse(f).name);
              const limit = Math.min(12, normTitle.length);
              const prefix = normTitle.slice(0, limit);
              return normFile.includes(prefix);
            });
          } catch (e) {
            return false;
          }
        };

        if (!checkFileExists()) {
          const errorMsg = 'Não foi possível salvar o arquivo de áudio (a música pode estar indisponível ou protegida).';
          emitStatus(sender, id, { status: 'error', error: errorMsg });
          return reject(new Error(errorMsg));
        }

        emitStatus(sender, id, { status: 'done', progress: 100, speed: '', eta: '' });
        return resolve();
      }

      const errorMsg = buildErrorMessage(fullStderr || fullStdout, code);
      emitStatus(sender, id, { status: 'error', error: errorMsg });
      reject(new Error(errorMsg));
    });
  });
}

function cancelDownload(id) {
  const proc = activeProcesses.get(id);
  if (proc) {
    proc.kill('SIGTERM');
    activeProcesses.delete(id);
  }
}

// ─── Progress Parsers ──────────────────────────────────────────────────────

function parseAndEmitProgress(line, id, sender) {
  line = line.trim();

  if (line.includes('[ExtractAudio]') || line.includes('[FFmpegExtractAudio]')) {
    emitStatus(sender, id, { status: 'converting', progress: 99, speed: '', eta: '' });
    return;
  }

  if (line.includes('[Metadata]') || line.includes('[EmbedThumbnail]')) {
    emitStatus(sender, id, { status: 'embedding', progress: 99, speed: '', eta: '' });
    return;
  }

  const m = line.match(
    /\[download\]\s+([\d.]+)%\s+of\s+([\d.]+\S+)\s+at\s+([\d.]+\S+)\s+ETA\s+(\S+)/
  );
  if (m) {
    const [, pct, total, speed, eta] = m;
    emitStatus(sender, id, {
      status: 'downloading',
      progress: parseFloat(pct),
      total,
      speed,
      eta,
    });
  }
}

function parseFfmpegProgress(text, id, sender) {
  if (text.match(/time=\d+:\d+:[\d.]+/)) {
    const sm = text.match(/speed=([\d.]+)x/);
    emitStatus(sender, id, {
      status: 'converting',
      progress: 99,
      speed: sm ? `${sm[1]}x` : '',
      eta: '',
    });
  }
}

// ─── Error Message Builder ─────────────────────────────────────────────────

function buildErrorMessage(output, code) {
  if (!output) return `Download falhou com codigo ${code}.`;
  if (output.includes('Private video'))     return 'Este video e privado e nao pode ser acessado.';
  if (output.includes('Video unavailable')) return 'Video indisponivel na plataforma.';
  if (output.includes('confirm your age'))  return 'Video com restricao de idade - requer login.';
  if (output.includes('Unsupported URL'))   return 'URL nao suportada. Verifique o endereco.';
  if (output.includes('ffmpeg') && output.includes('not found'))
    return 'FFmpeg nao encontrado. Execute npm install para reinstalar os binarios.';

  const errorLine = output.split('\n').find(
    (l) => l.includes('ERROR:') || (l.trim().length > 15 && !l.includes('WARNING'))
  );
  return errorLine
    ? `Erro: ${errorLine.replace(/^.*ERROR:\s*/, '').trim().slice(0, 140)}`
    : `Download falhou (codigo ${code}). Tente novamente.`;
}

// ─── IPC Event Helper ──────────────────────────────────────────────────────

function emitStatus(sender, id, payload) {
  if (!sender || sender.isDestroyed()) return;
  sender.send('download:progress', { id, ...payload });
}

module.exports = { startDownload, cancelDownload, DEFAULT_OUT_DIR };
