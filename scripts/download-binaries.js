/**
 * scripts/download-binaries.js
 *
 * Runs automatically via `postinstall`. Downloads the latest yt-dlp and
 * a static FFmpeg build for the current platform into the /bin directory.
 *
 * Strategy: Uses native curl/wget (available on modern Windows/Linux/macOS)
 * as primary downloader, with a Node.js https fallback.
 */

const https     = require('https');
const fs        = require('fs');
const path      = require('path');
const { execSync, spawnSync } = require('child_process');

const BIN_DIR   = path.join(__dirname, '..', 'bin');
const PLATFORM  = process.platform;
const ARCH      = process.arch;

// ─── URLs ──────────────────────────────────────────────────────────────────

const YTDLP_BASE = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download';

function getYtdlpUrl() {
  if (PLATFORM === 'win32')  return `${YTDLP_BASE}/yt-dlp.exe`;
  if (PLATFORM === 'darwin') return `${YTDLP_BASE}/yt-dlp_macos`;
  return `${YTDLP_BASE}/yt-dlp`;
}

const SPOTDL_API = 'https://api.github.com/repos/spotDL/spotify-downloader/releases/latest';

async function getSpotdlUrl() {
  return new Promise((resolve, reject) => {
    https.get(SPOTDL_API, { headers: { 'User-Agent': 'YtoWave-Installer' } }, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const assets = json.assets || [];
          let target = '';
          if (PLATFORM === 'win32') target = 'win32.exe';
          else if (PLATFORM === 'darwin') target = 'darwin';
          else target = 'linux';
          
          const asset = assets.find(a => a.name.includes(target));
          if (asset) resolve(asset.browser_download_url);
          else reject(new Error('spotDL asset not found for platform'));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

const FFMPEG_BASE = 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest';

function getFfmpegUrl() {
  if (PLATFORM === 'win32')  return `${FFMPEG_BASE}/ffmpeg-master-latest-win64-gpl.zip`;
  if (PLATFORM === 'darwin') return `${FFMPEG_BASE}/ffmpeg-master-latest-macos64-gpl.tar.xz`;
  return `${FFMPEG_BASE}/ffmpeg-master-latest-linux64-gpl.tar.xz`;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function log(msg) { process.stdout.write(`[YtoWave Setup] ${msg}\n`); }

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/** Try to find curl or wget on PATH */
function findDownloader() {
  for (const tool of ['curl', 'wget']) {
    try {
      const result = spawnSync(tool, ['--version'], { encoding: 'utf8', timeout: 3000 });
      if (result.status === 0) return tool;
    } catch {}
  }
  return null;
}

/**
 * Downloads via curl (cross-platform, handles redirects automatically).
 */
function downloadViaCurl(url, dest) {
  log(`curl: ${url}`);
  const result = spawnSync(
    'curl',
    ['-L', '--fail', '--progress-bar', '--output', dest, url],
    { stdio: 'inherit', encoding: 'utf8', timeout: 300_000 }
  );
  if (result.status !== 0) {
    throw new Error(`curl exited with code ${result.status}`);
  }
}

/**
 * Downloads via wget.
 */
function downloadViaWget(url, dest) {
  log(`wget: ${url}`);
  const result = spawnSync(
    'wget',
    ['-q', '--show-progress', '-O', dest, url],
    { stdio: 'inherit', encoding: 'utf8', timeout: 300_000 }
  );
  if (result.status !== 0) {
    throw new Error(`wget exited with code ${result.status}`);
  }
}

/**
 * Fallback: pure Node.js https download following redirects.
 */
function downloadViaNode(url, dest) {
  return new Promise((resolve, reject) => {
    log(`https (Node): ${url}`);
    const file = fs.createWriteStream(dest);

    function get(currentUrl, redirects = 0) {
      if (redirects > 10) return reject(new Error('Too many redirects'));

      const parsed = new URL(currentUrl);
      const options = {
        hostname: parsed.hostname,
        path:     parsed.pathname + parsed.search,
        method:   'GET',
        headers:  { 'User-Agent': 'YtoWave-Installer/1.0' },
        timeout:  60000,
      };

      https.get(options, (res) => {
        if ([301, 302, 307, 308].includes(res.statusCode)) {
          file.close();
          const newFile = fs.createWriteStream(dest);
          return get(res.headers.location, redirects + 1);
        }
        if (res.statusCode !== 200) {
          file.close();
          fs.unlink(dest, () => {});
          return reject(new Error(`HTTP ${res.statusCode} from ${currentUrl}`));
        }

        const total = parseInt(res.headers['content-length'] || '0', 10);
        let downloaded = 0;
        let lastPct = -1;

        res.on('data', (chunk) => {
          downloaded += chunk.length;
          if (total > 0) {
            const pct = Math.floor((downloaded / total) * 100);
            if (pct !== lastPct && pct % 10 === 0) {
              process.stdout.write(`\r  → ${pct}% (${(downloaded / 1024 / 1024).toFixed(1)} MB / ${(total / 1024 / 1024).toFixed(1)} MB)`);
              lastPct = pct;
            }
          }
        });

        res.pipe(file);
        file.on('finish', () => { process.stdout.write('\n'); file.close(resolve); });
        file.on('error', (err) => { fs.unlink(dest, () => {}); reject(err); });
      }).on('error', reject);
    }

    get(url);
  });
}

/**
 * Main download dispatcher — tries curl, wget, then Node fallback.
 */
async function download(url, dest) {
  const tool = findDownloader();

  if (tool === 'curl') {
    downloadViaCurl(url, dest);
  } else if (tool === 'wget') {
    downloadViaWget(url, dest);
  } else {
    log('curl/wget not found, using Node.js https (slower)...');
    await downloadViaNode(url, dest);
  }

  // Verify file size
  const size = fs.existsSync(dest) ? fs.statSync(dest).size : 0;
  if (size < 1024) {
    fs.unlink(dest, () => {});
    throw new Error(`Downloaded file is too small (${size} bytes) — likely failed.`);
  }
  log(`  ✓ Downloaded ${(size / 1024 / 1024).toFixed(1)} MB`);
}

// ─── Extraction ────────────────────────────────────────────────────────────

async function extractZip(zipPath, destDir) {
  const extract = require('extract-zip');
  const tmpDir  = path.join(destDir, '_ffmpeg_tmp');
  ensureDir(tmpDir);
  log('Extracting FFmpeg ZIP...');
  await extract(zipPath, { dir: tmpDir });

  const ffmpegBin = findInDir(tmpDir, PLATFORM === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
  if (!ffmpegBin) throw new Error('ffmpeg binary not found inside ZIP');

  const destBin = path.join(destDir, PLATFORM === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
  fs.copyFileSync(ffmpegBin, destBin);
  if (PLATFORM !== 'win32') fs.chmodSync(destBin, 0o755);

  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.unlinkSync(zipPath);
  log(`  ✓ FFmpeg installed: ${destBin}`);
}

function extractTarXz(tarPath, destDir) {
  const tmpDir = path.join(destDir, '_ffmpeg_tmp');
  ensureDir(tmpDir);
  log('Extracting FFmpeg tar.xz...');
  execSync(`tar -xJf "${tarPath}" -C "${tmpDir}"`, { stdio: 'inherit' });

  const ffmpegBin = findInDir(tmpDir, 'ffmpeg');
  if (!ffmpegBin) throw new Error('ffmpeg binary not found inside tar.xz');

  const destBin = path.join(destDir, 'ffmpeg');
  fs.copyFileSync(ffmpegBin, destBin);
  fs.chmodSync(destBin, 0o755);

  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.unlinkSync(tarPath);
  log(`  ✓ FFmpeg installed: ${destBin}`);
}

function findInDir(dir, name) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findInDir(full, name);
      if (found) return found;
    } else if (entry.name === name) {
      return full;
    }
  }
  return null;
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  log('══════════════════════════════════════════');
  log(`Platform: ${PLATFORM} / ${ARCH}`);
  log(`Downloader: ${findDownloader() || 'Node.js https'}`);
  log('══════════════════════════════════════════');

  ensureDir(BIN_DIR);

  // ── yt-dlp ──────────────────────────────────────────────────────────────
  const ytdlpName = PLATFORM === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
  const ytdlpDest = path.join(BIN_DIR, ytdlpName);

  if (fs.existsSync(ytdlpDest) && fs.statSync(ytdlpDest).size > 1024 * 100) {
    log(`yt-dlp already present (${(fs.statSync(ytdlpDest).size / 1024 / 1024).toFixed(1)} MB), skipping.`);
  } else {
    // Remove stale/empty file if exists
    if (fs.existsSync(ytdlpDest)) fs.unlinkSync(ytdlpDest);
    log('Downloading yt-dlp...');
    try {
      await download(getYtdlpUrl(), ytdlpDest);
      if (PLATFORM !== 'win32') fs.chmodSync(ytdlpDest, 0o755);
    } catch (err) {
      log(`⚠ Could not download yt-dlp: ${err.message}`);
      log('  Install manually: https://github.com/yt-dlp/yt-dlp/releases');
    }
  }

  // ── spotDL ──────────────────────────────────────────────────────────────
  const spotdlName = PLATFORM === 'win32' ? 'spotdl.exe' : 'spotdl';
  const spotdlDest = path.join(BIN_DIR, spotdlName);

  if (fs.existsSync(spotdlDest) && fs.statSync(spotdlDest).size > 1024 * 100) {
    log(`spotDL already present (${(fs.statSync(spotdlDest).size / 1024 / 1024).toFixed(1)} MB), skipping.`);
  } else {
    if (fs.existsSync(spotdlDest)) fs.unlinkSync(spotdlDest);
    log('Downloading spotDL...');
    try {
      const spotdlUrl = await getSpotdlUrl();
      await download(spotdlUrl, spotdlDest);
      if (PLATFORM !== 'win32') fs.chmodSync(spotdlDest, 0o755);
    } catch (err) {
      log(`⚠ Could not download spotDL: ${err.message}`);
    }
  }

  // ── FFmpeg ───────────────────────────────────────────────────────────────
  const ffmpegName = PLATFORM === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  const ffmpegDest = path.join(BIN_DIR, ffmpegName);

  if (fs.existsSync(ffmpegDest) && fs.statSync(ffmpegDest).size > 1024 * 100) {
    log(`FFmpeg already present (${(fs.statSync(ffmpegDest).size / 1024 / 1024).toFixed(1)} MB), skipping.`);
  } else {
    if (fs.existsSync(ffmpegDest)) fs.unlinkSync(ffmpegDest);
    log('Downloading FFmpeg...');

    const ffmpegUrl = getFfmpegUrl();
    const isZip = ffmpegUrl.endsWith('.zip');
    const tmpPath = path.join(BIN_DIR, isZip ? 'ffmpeg_tmp.zip' : 'ffmpeg_tmp.tar.xz');

    try {
      await download(ffmpegUrl, tmpPath);
      if (isZip) {
        await extractZip(tmpPath, BIN_DIR);
      } else {
        extractTarXz(tmpPath, BIN_DIR);
      }
    } catch (err) {
      log(`⚠ Could not download FFmpeg: ${err.message}`);
      log('  Install manually: https://ffmpeg.org/download.html');
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    }
  }

  log('══════════════════════════════════════════');
  log('Setup complete! Run `npm run dev` to start.');
  log('══════════════════════════════════════════');
}

main().catch((err) => {
  console.error('[YtoWave Setup] Fatal:', err.message);
  // Don't exit 1 — don't block npm install if binaries fail
});
