/* Paths, downloads and archive handling.

   Layout:
     <userData>/shared/     assets, libraries, versions, java   (immutable, shared)
     <userData>/instances/<profileId>/   saves, mods, config    (isolated per profile)

   Immutable files are shared so a second profile costs megabytes, not gigabytes.
   Anything the game writes to lives in the instance and never leaks between profiles. */
const { app } = require('electron');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { pipeline } = require('stream/promises');
const { spawn } = require('child_process');

const root      = () => app.getPath('userData');
const shared    = (...p) => path.join(root(), 'shared', ...p);
const instance  = (id, ...p) => path.join(root(), 'instances', id, ...p);
const OS   = { win32: 'windows', darwin: 'osx', linux: 'linux' }[process.platform] || 'linux';
const ARCH = process.arch === 'ia32' ? 'x86' : process.arch;

async function ensureDir(d) { await fsp.mkdir(d, { recursive: true }); }

async function sha1(file) {
  const h = crypto.createHash('sha1');
  await pipeline(fs.createReadStream(file), h);
  return h.digest('hex');
}

/* True when the file is already present and matches. Lets us resume a half
   finished install without re-downloading gigabytes. */
async function verified(file, expectedSha1, size) {
  try {
    const st = await fsp.stat(file);
    if (size && st.size !== size) return false;
    if (!expectedSha1) return st.size > 0;
    return (await sha1(file)) === expectedSha1;
  } catch { return false; }
}

async function download(url, dest, { sha1: want, size, retries = 3 } = {}) {
  if (await verified(dest, want, size)) return { skipped: true, bytes: size || 0 };
  await ensureDir(path.dirname(dest));
  let lastErr;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${res.status} ${url}`);
      const tmp = dest + '.part';
      await pipeline(res.body, fs.createWriteStream(tmp));
      if (want) {
        const got = await sha1(tmp);
        if (got !== want) { await fsp.unlink(tmp).catch(() => {}); throw new Error(`checksum mismatch for ${path.basename(dest)}`); }
      }
      await fsp.rename(tmp, dest);
      const st = await fsp.stat(dest);
      return { skipped: false, bytes: st.size };
    } catch (e) {
      lastErr = e;
      await new Promise(r => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  throw lastErr;
}

/* Bounded parallel downloads. Mojang serves thousands of tiny asset files;
   doing them one at a time takes many minutes, and unbounded floods the socket
   pool and starts failing. */
async function pool(items, worker, limit = 12) {
  let i = 0, active = 0;
  return new Promise((resolve, reject) => {
    let failed = false;
    const next = () => {
      if (failed) return;
      if (i >= items.length && active === 0) return resolve();
      while (active < limit && i < items.length) {
        const item = items[i++];
        active++;
        worker(item).then(() => { active--; next(); },
          e => { failed = true; reject(e); });
      }
    };
    next();
  });
}

async function unzip(zipFile, destDir, { strip = 0 } = {}) {
  await ensureDir(destDir);
  const extract = require('extract-zip');
  await extract(zipFile, {
    dir: destDir,
    onEntry(entry) {
      if (strip) entry.fileName = entry.fileName.split('/').slice(strip).join('/');
    }
  });
}

async function untar(tarFile, destDir, { strip = 0 } = {}) {
  await ensureDir(destDir);
  await new Promise((res, rej) => {
    const p = spawn('tar', ['-xzf', tarFile, '-C', destDir, `--strip-components=${strip}`]);
    p.on('error', rej);
    p.on('close', c => c === 0 ? res() : rej(new Error('tar failed')));
  });
}

/* Mojang encodes OS rules on libraries and launch arguments. A rule block with
   no matching entry means "not for this platform". */
function allowed(rules, features = {}) {
  if (!rules || !rules.length) return true;
  let ok = false;
  for (const r of rules) {
    let match = true;
    if (r.os) {
      if (r.os.name && r.os.name !== OS) match = false;
      if (r.os.arch && r.os.arch !== ARCH) match = false;
      if (r.os.version && !new RegExp(r.os.version).test(require('os').release())) match = false;
    }
    if (r.features) {
      for (const [k, v] of Object.entries(r.features)) if (Boolean(features[k]) !== v) match = false;
    }
    if (match) ok = r.action === 'allow';
  }
  return ok;
}

/* group:artifact:version[:classifier] -> group/path/artifact/version/artifact-version[-classifier].jar */
function mavenPath(name) {
  const [group, artifact, version, classifier] = name.split(':');
  const suffix = classifier ? `-${classifier}` : '';
  return path.join(group.replace(/\./g, '/'), artifact, version, `${artifact}-${version}${suffix}.jar`);
}

module.exports = { root, shared, instance, OS, ARCH, ensureDir, sha1, verified,
                   download, pool, unzip, untar, allowed, mavenPath, fsp };
