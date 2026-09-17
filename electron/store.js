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

/* --- sessions (refresh tokens) ----------------------------------------
   A list, so several Minecraft accounts can be kept signed in at once. The
   whole list is encrypted with the OS keychain as one blob. Files written by
   older versions held a single object; those are read and migrated.
   --------------------------------------------------------------------- */
async function saveSessions(list, activeUuid) {
  if (!safeStorage.isEncryptionAvailable()) {
    // No keychain (some Linux setups). Store nothing rather than write
    // refresh tokens in plain text.
    return;
  }
  const payload = JSON.stringify({
    v: 2,
    active: activeUuid || null,
    accounts: list.map(s => ({ refreshToken: s.refreshToken, accessToken:s.accessToken, expiresAt:s.expiresAt, name: s.name, uuid: s.uuid, skins:s.skins, capes:s.capes }))
  });
  const temporary=AUTH()+'.tmp';
  await fs.writeFile(temporary,safeStorage.encryptString(payload));
  await fs.rename(temporary,AUTH());
}

async function loadSessions() {
  try {
    const buf = await fs.readFile(AUTH());
    if (!safeStorage.isEncryptionAvailable()) return { accounts: [], active: null };
    const data = JSON.parse(safeStorage.decryptString(buf));
    if (data && data.v === 2) return { accounts: data.accounts || [], active: data.active };
    // v1: one account in a bare object
    if (data && data.refreshToken)
      return { accounts: [data], active: data.uuid || null };
    return { accounts: [], active: null };
  } catch { return { accounts: [], active: null }; }
}

async function clearSessions() {
  try { await fs.unlink(AUTH()); } catch {}
}

/* --- launcher data (profiles, skins, settings) ------------------------ */
async function loadData() { const data=await readJson(DATA(),null);require('./game/io').setProfiles(data?.profiles||[]);return data; }
let dataWrites=Promise.resolve();
function saveData(obj) {
 const snapshot=JSON.parse(JSON.stringify(obj));
 return dataWrites=dataWrites.catch(()=>{}).then(async()=>{
  const previous=await readJson(DATA(),null),transaction=await require('./game/directories').reconcile(snapshot,previous);
  try{const temporary=DATA()+'.tmp';await fs.writeFile(temporary,JSON.stringify(transaction.data,null,2));await fs.rename(temporary,DATA());}
  catch(error){await transaction.rollback();throw error;}
  require('./game/io').setProfiles(transaction.data?.profiles||[]);return transaction.data;
 });
}

module.exports = { saveSessions, loadSessions, clearSessions, loadData, saveData, dir };
