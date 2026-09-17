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
  if(!mod.fileName||path.basename(mod.fileName)!==mod.fileName||/[\\/:]/.test(mod.fileName))throw Error('Invalid mod filename');
  const dir = dirFor(profile);
  await io.ensureDir(dir);
  const target = path.join(dir, mod.fileName + (mod.enabled === false ? '.disabled' : ''));
  if(!mod.url){if(await io.verified(target))return target;if(mod.enabled===false)return target;throw Error('Local mod is missing: '+mod.fileName);}
  await io.download(mod.url, target, { sha1: mod.sha1 });
  return target;
}

/* Bring the folder in line with the profile before launching: fetch anything
   missing, and delete jars the user removed from the list. */
const clientmod = require('./clientmod');

async function sync(profile, onProgress = () => {}) {
  /* The client mod is managed, not chosen: every Fabric profile gets it and
     keeps it current, which is what makes the launcher and the in-game
     client feel like one product. */
  const result = await clientmod.ensure(profile, onProgress);
  if(result.installed)onProgress({stage:'mods',pct:90,detail:`Monkey Client ${result.installed} installed`});

  const mods = profile.mods || [];
  const dir = dirFor(profile);
  await io.ensureDir(dir);

  let done = 0;
  for (const mod of mods) {
    onProgress({ stage: 'mods', pct: 88, detail: `Checking mods — ${++done} of ${mods.length}` });
    await download(profile, mod);
  }

  // Unlisted local JARs belong to the player. Only an explicit Remove action
  // or a reviewed version migration may remove them.
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
