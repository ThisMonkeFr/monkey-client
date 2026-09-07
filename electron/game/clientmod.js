/* ------------------------------------------------------------------
   Keeps the Monkey Client mod present and current in every Fabric
   profile, so players never install it by hand. Runs before launch.

   It is deliberately forgiving: if GitHub is unreachable, an existing
   jar is left alone and the game still starts.
   ------------------------------------------------------------------ */
const path = require('path');
const io = require('./io');
const { fsp } = io;
const { clientModRepo } = require('../config');

const MANAGED = 'monkeyclient.jar';          // our jar always has this name
const MARKER = 'monkeyclient-version.json';  // what we last installed

const modsDir = (profile) =>
  path.join(profile.settings && profile.settings.gameDir
    ? profile.settings.gameDir : io.instance(profile.id), 'mods');

async function latestRelease() {
  const r = await fetch(`https://api.github.com/repos/${clientModRepo}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'MonkeyClient' }
  });
  if (!r.ok) throw new Error(`GitHub said ${r.status}`);
  const rel = await r.json();
  const asset = (rel.assets || []).find(a =>
    /^monkeyclient.*\.jar$/i.test(a.name) && !/sources/i.test(a.name));
  if (!asset) throw new Error('That release has no mod jar attached.');
  return { version: rel.tag_name || rel.name, url: asset.browser_download_url, size: asset.size };
}

async function installedVersion(dir) {
  try { return JSON.parse(await fsp.readFile(path.join(dir, MARKER), 'utf8')).version; }
  catch { return null; }
}

/**
 * Fabric API is a hard dependency of the mod, so the launcher fetches the
 * build matching this profile rather than making the player find it.
 */
async function ensureFabricApi(profile, dir, onProgress) {
  if ((profile.mods || []).some(m => /fabric[-_]?api/i.test(m.fileName || m.title || ''))) return;
  onProgress({ stage: 'mods', pct: 88, detail: 'Checking Fabric API' });
  const q = `https://api.modrinth.com/v2/project/fabric-api/version`
    + `?loaders=${encodeURIComponent(JSON.stringify(['fabric']))}`
    + `&game_versions=${encodeURIComponent(JSON.stringify([profile.version]))}`;
  const r = await fetch(q);
  if (!r.ok) throw new Error(`Modrinth said ${r.status}`);
  const list = await r.json();
  if (!Array.isArray(list) || !list.length)
    throw new Error(`Fabric API has no build for ${profile.version}.`);
  const file = list[0].files.find(f => f.primary) || list[0].files[0];
  const target = path.join(dir, 'fabric-api-managed.jar');
  await io.download(file.url, target, { sha1: file.hashes && file.hashes.sha1 });
}

async function ensure(profile, onProgress = () => {}) {
  if (profile.loader !== 'fabric') return { skipped: 'not a Fabric profile' };
  if (profile.settings && profile.settings.clientMod === false)
    return { skipped: 'disabled for this profile' };

  const dir = modsDir(profile);
  await io.ensureDir(dir);

  try {
    await ensureFabricApi(profile, dir, onProgress);
  } catch (e) {
    // Not fatal on its own: the player may have installed it themselves.
    onProgress({ stage: 'mods', pct: 88, detail: `Fabric API: ${e.message}` });
  }

  let release;
  try {
    release = await latestRelease();
  } catch (e) {
    const have = await installedVersion(dir);
    return have
      ? { kept: have, message: `Kept ${have} (${e.message})` }
      : { failed: e.message };
  }

  const have = await installedVersion(dir);
  const jar = path.join(dir, MANAGED);
  const present = await fsp.stat(jar).then(() => true).catch(() => false);
  if (have === release.version && present) return { current: have };

  onProgress({ stage: 'mods', pct: 90, detail: `Installing Monkey Client ${release.version}` });
  await io.download(release.url, jar, { size: release.size });
  await fsp.writeFile(path.join(dir, MARKER),
    JSON.stringify({ version: release.version, installed: Date.now() }, null, 2));

  // Clear out any older copies the player may have dropped in by hand.
  for (const f of await fsp.readdir(dir).catch(() => [])) {
    if (f !== MANAGED && /^monkeyclient.*\.jar$/i.test(f))
      await fsp.unlink(path.join(dir, f)).catch(() => {});
  }
  return { installed: release.version };
}

module.exports = { ensure, modsDir };
