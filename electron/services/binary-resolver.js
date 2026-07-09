/**
 * electron/services/binary-resolver.js
 *
 * Resolves absolute paths to the yt-dlp and FFmpeg binaries,
 * supporting both dev (project /bin) and production (app.asar extraResources) modes.
 */

const path = require('path');
const fs = require('fs');
const { app } = require('electron');

const IS_PROD = app.isPackaged;
const IS_WIN = process.platform === 'win32';

function getBinDir() {
  if (IS_PROD) {
    // electron-builder extraResources places bin/ next to the app.asar
    return path.join(process.resourcesPath, 'bin');
  }
  // Development: /bin at project root
  return path.join(__dirname, '..', '..', 'bin');
}

function resolveBinary(name) {
  const binName = IS_WIN ? `${name}.exe` : name;
  const resolved = path.join(getBinDir(), binName);

  if (!fs.existsSync(resolved)) {
    throw new Error(
      `Binary "${binName}" not found at "${resolved}".\n` +
      `Run "npm install" (which triggers postinstall) to download it automatically.`
    );
  }

  return resolved;
}

module.exports = { resolveBinary, getBinDir };
