/* Token storage. Refresh tokens are encrypted with the OS keychain via
   Electron safeStorage — DPAPI on Windows, Keychain on macOS, libsecret
   on Linux. Profiles are plain JSON; they hold nothing sensitive. */
const { app, safeStorage } = require('electron');
const fs = require('fs/promises');
const path = require('path');

const dir  = () => app.getPath('userData');
const AUTH = () => path.join(dir(), 'auth.bin');
const DATA = () => path.join(dir(), 'launcher.json');

async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch { return fallback; }
}

/* --- session (refresh token) ----------------------------------------- */
async function saveSession(session) {
  const payload = JSON.stringify({ refreshToken: session.refreshToken, name: session.name, uuid: session.uuid });
  if (safeStorage.isEncryptionAvailable()) {
    await fs.writeFile(AUTH(), safeStorage.encryptString(payload));
  } else {
    // No keychain available (some Linux setups). Store nothing rather than
    // writing a refresh token in plain text.
    await clearSession();
  }
}

async function loadSession() {
  try {
    const buf = await fs.readFile(AUTH());
    if (!safeStorage.isEncryptionAvailable()) return null;
    return JSON.parse(safeStorage.decryptString(buf));
  } catch { return null; }
}

async function clearSession() {
  try { await fs.unlink(AUTH()); } catch {}
}

/* --- launcher data (profiles, skins, settings) ------------------------ */
async function loadData() { return readJson(DATA(), null); }
async function saveData(obj) { await fs.writeFile(DATA(), JSON.stringify(obj, null, 2)); }

module.exports = { saveSession, loadSession, clearSession, loadData, saveData, dir };
