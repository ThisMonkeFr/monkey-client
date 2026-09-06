/* Mod files on disk. The renderer records what a profile *should* have;
   this puts the jars in that profile's own mods folder and keeps them in sync.
   Disabling renames to .disabled, which is what Fabric itself ignores. */
const path = require('path');
const { shell } = require('electron');
const io = require('./io');
const { instance, fsp } = io;

const dirFor = (profile) =>
  path.join(profile.settings && profile.settings.gameDir ? profile.settings.gameDir : instance(profile.id), 'mods');

async function download(profile, mod) {
  const dir = dirFor(profile);
  await io.ensureDir(dir);
  const target = path.join(dir, mod.fileName + (mod.enabled === false ? '.disabled' : ''));
  await io.download(mod.url, target, { sha1: mod.sha1 });
  return target;
}

/* Bring the folder in line with the profile before launching: fetch anything
   missing, and delete jars the user removed from the list. */
async function sync(profile, onProgress = () => {}) {
  const mods = profile.mods || [];
  const dir = dirFor(profile);
  await io.ensureDir(dir);

  let done = 0;
  for (const mod of mods) {
    onProgress({ stage: 'mods', pct: 88, detail: `Checking mods — ${++done} of ${mods.length}` });
    await download(profile, mod);
  }

  const wanted = new Set(mods.flatMap(m => [m.fileName, m.fileName + '.disabled']));
  for (const f of await fsp.readdir(dir).catch(() => [])) {
    if (/\.jar(\.disabled)?$/.test(f) && !wanted.has(f)) {
      await fsp.unlink(path.join(dir, f)).catch(() => {});
    }
  }
}

async function setEnabled(profile, fileName, enabled) {
  const dir = dirFor(profile);
  const on = path.join(dir, fileName);
  const off = on + '.disabled';
  try {
    if (enabled) await fsp.rename(off, on);
    else await fsp.rename(on, off);
  } catch { /* file not downloaded yet — sync will place it correctly */ }
}

async function remove(profile, fileName) {
  const dir = dirFor(profile);
  await fsp.unlink(path.join(dir, fileName)).catch(() => {});
  await fsp.unlink(path.join(dir, fileName + '.disabled')).catch(() => {});
}

async function openFolder(profile) {
  const dir = dirFor(profile);
  await io.ensureDir(dir);
  shell.openPath(dir);
}

module.exports = { sync, download, setEnabled, remove, openFolder, dirFor };
