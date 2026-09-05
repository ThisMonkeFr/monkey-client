/* Resolving and installing a Minecraft version: manifest, libraries, assets,
   natives, client jar, plus the Fabric loader when a profile asks for it. */
const path = require('path');
const io = require('./io');
const { shared, download, pool, allowed, mavenPath, fsp } = io;

const MANIFEST = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';
const ASSETS   = 'https://resources.download.minecraft.net';
const FABRIC   = 'https://meta.fabricmc.net/v2';

const json = async (url) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} while fetching ${url}`);
  return r.json();
};

/* --- version metadata ------------------------------------------------ */
let manifestCache = null;
async function manifest() {
  if (!manifestCache) manifestCache = await json(MANIFEST);
  return manifestCache;
}

async function versionJson(id) {
  const local = shared('versions', id, `${id}.json`);
  try { return JSON.parse(await fsp.readFile(local, 'utf8')); } catch {}
  const m = await manifest();
  const entry = m.versions.find(v => v.id === id);
  if (!entry) {
    throw new Error(`Minecraft ${id} is not in Mojang's version manifest. ` +
      `Check the version name, or it may not be released yet.`);
  }
  const data = await json(entry.url);
  await io.ensureDir(path.dirname(local));
  await fsp.writeFile(local, JSON.stringify(data));
  return data;
}

/* --- Fabric ----------------------------------------------------------- */
async function fabricLoaders(gameVersion) {
  const list = await json(`${FABRIC}/versions/loader/${encodeURIComponent(gameVersion)}`);
  if (!list.length) throw new Error(`Fabric has no loader for Minecraft ${gameVersion} yet.`);
  return list.map(l => l.loader.version);
}

async function fabricProfile(gameVersion, loaderVersion) {
  const v = loaderVersion || (await fabricLoaders(gameVersion))[0];
  const p = await json(`${FABRIC}/versions/loader/${encodeURIComponent(gameVersion)}/${v}/profile/json`);
  return { profile: p, loaderVersion: v };
}

/* Merge Fabric on top of vanilla. Fabric supplies its own mainClass and a set
   of maven-coordinate libraries which must precede the vanilla ones. */
async function resolve(mcVersion, loader) {
  const vanilla = await versionJson(mcVersion);
  if (loader !== 'fabric') return { version: vanilla, extraLibs: [], mainClass: vanilla.mainClass };

  const { profile, loaderVersion } = await fabricProfile(mcVersion);
  const extraLibs = (profile.libraries || []).map(l => ({
    name: l.name,
    url: (l.url || 'https://maven.fabricmc.net/').replace(/\/?$/, '/') + mavenPath(l.name).replace(/\\/g, '/'),
    path: mavenPath(l.name),
    sha1: l.sha1 || null,
    size: l.size || null
  }));
  return {
    version: vanilla,
    extraLibs,
    mainClass: profile.mainClass,
    loaderVersion,
    extraJvm: (profile.arguments && profile.arguments.jvm) || [],
    extraGame: (profile.arguments && profile.arguments.game) || []
  };
}

/* --- what needs downloading ------------------------------------------ */
function libraryTasks(version) {
  const jars = [];      // classpath entries
  const natives = [];   // archives to unpack next to the game
  for (const lib of version.libraries || []) {
    if (!allowed(lib.rules)) continue;
    const d = lib.downloads || {};
    if (d.artifact) {
      const isNative = /:natives-/.test(lib.name || '');
      const target = { file: shared('libraries', d.artifact.path), url: d.artifact.url,
                       sha1: d.artifact.sha1, size: d.artifact.size };
      (isNative ? natives : jars).push(target);
    }
    // Pre-1.19 style: natives live under classifiers keyed by OS.
    if (lib.natives && lib.natives[io.OS] && d.classifiers) {
      const key = lib.natives[io.OS].replace('${arch}', process.arch === 'ia32' ? '32' : '64');
      const c = d.classifiers[key];
      if (c) natives.push({ file: shared('libraries', c.path), url: c.url, sha1: c.sha1, size: c.size });
    }
  }
  return { jars, natives };
}

async function assetTasks(version) {
  const idx = version.assetIndex;
  if (!idx) return { index: null, objects: [] };
  const indexFile = shared('assets', 'indexes', `${idx.id}.json`);
  await download(idx.url, indexFile, { sha1: idx.sha1 });
  const data = JSON.parse(await fsp.readFile(indexFile, 'utf8'));
  const objects = Object.values(data.objects).map(o => ({
    file: shared('assets', 'objects', o.hash.slice(0, 2), o.hash),
    url: `${ASSETS}/${o.hash.slice(0, 2)}/${o.hash}`,
    sha1: o.hash, size: o.size
  }));
  return { index: idx.id, objects };
}

/* --- install ---------------------------------------------------------- */
async function install(mcVersion, loader, onProgress = () => {}) {
  onProgress({ stage: 'metadata', pct: 2, detail: `Reading Minecraft ${mcVersion} manifest` });
  const resolved = await resolve(mcVersion, loader);
  const version = resolved.version;

  onProgress({ stage: 'metadata', pct: 5, detail: 'Working out what needs downloading' });
  const { jars, natives } = libraryTasks(version);
  const { index, objects } = await assetTasks(version);

  const client = {
    file: shared('versions', version.id, `${version.id}.jar`),
    url: version.downloads.client.url,
    sha1: version.downloads.client.sha1,
    size: version.downloads.client.size
  };

  const fabricJars = [];
  for (const l of resolved.extraLibs) {
    fabricJars.push({ file: shared('libraries', l.path), url: l.url, sha1: l.sha1, size: l.size });
  }

  const all = [client, ...jars, ...natives, ...fabricJars, ...objects];
  const totalBytes = all.reduce((n, t) => n + (t.size || 0), 0) || 1;
  let doneBytes = 0, doneCount = 0;

  await pool(all, async (t) => {
    const r = await download(t.url, t.file, { sha1: t.sha1, size: t.size });
    doneBytes += r.bytes || t.size || 0;
    doneCount++;
    if (doneCount % 12 === 0 || doneCount === all.length) {
      onProgress({
        stage: 'download',
        pct: 5 + Math.round((doneBytes / totalBytes) * 80),
        detail: `Downloading game files — ${doneCount} of ${all.length}`
      });
    }
  });

  return {
    version, resolved, client, natives, assetIndex: index,
    classpath: [...fabricJars.map(j => j.file), ...jars.map(j => j.file), client.file]
  };
}

module.exports = { install, resolve, versionJson, manifest, fabricLoaders };
