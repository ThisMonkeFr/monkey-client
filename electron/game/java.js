/* Java runtime: use what's on the machine when it's the right major version,
   otherwise fetch a JRE from Adoptium into the shared folder. The user never
   has to know what a JDK is. */
const path = require('path');
const { spawn } = require('child_process');
const io = require('./io');
const { shared, fsp } = io;

const EXE = process.platform === 'win32' ? 'javaw.exe' : 'java';
const ADOPTIUM = 'https://api.adoptium.net/v3/binary/latest';

function probe(bin) {
  return new Promise(resolve => {
    const p = spawn(bin, ['-version']);
    let out = '';
    p.on('error', () => resolve(null));
    p.stderr.on('data', d => out += d);          // java -version writes to stderr
    p.stdout.on('data', d => out += d);
    p.on('close', () => {
      const m = out.match(/version "(\d+)(?:\.(\d+))?/);
      if (!m) return resolve(null);
      // 1.8.0_x reports as 1.8; anything modern reports its major directly.
      const major = m[1] === '1' ? parseInt(m[2]) : parseInt(m[1]);
      resolve({ bin, major });
    });
  });
}

async function candidates() {
  const list = ['java'];
  if (process.env.JAVA_HOME) list.push(path.join(process.env.JAVA_HOME, 'bin', EXE));
  try {
    const dir = shared('java');
    for (const d of await fsp.readdir(dir)) {
      list.push(path.join(dir, d, 'bin', EXE));
      list.push(path.join(dir, d, 'Contents', 'Home', 'bin', EXE)); // macOS layout
    }
  } catch {}
  return list;
}

async function find(majorNeeded) {
  for (const bin of await candidates()) {
    const r = await probe(bin);
    if (r && r.major >= majorNeeded) return r.bin;
  }
  return null;
}

async function fetchJre(major, onProgress) {
  const os = { win32: 'windows', darwin: 'mac', linux: 'linux' }[process.platform];
  const arch = process.arch === 'arm64' ? 'aarch64' : 'x64';
  const url = `${ADOPTIUM}/${major}/ga/${os}/${arch}/jre/hotspot/normal/eclipse`;
  const isZip = process.platform === 'win32';
  const archive = shared('java', `jre-${major}.${isZip ? 'zip' : 'tar.gz'}`);
  const dir = shared('java', `jre-${major}`);

  onProgress({ stage: 'java', pct: 8, detail: `Downloading Java ${major}` });
  await io.download(url, archive);
  onProgress({ stage: 'java', pct: 14, detail: `Unpacking Java ${major}` });
  isZip ? await io.unzip(archive, dir, { strip: 1 }) : await io.untar(archive, dir, { strip: 1 });
  await fsp.unlink(archive).catch(() => {});

  const bin = path.join(dir, 'bin', EXE);
  const mac = path.join(dir, 'Contents', 'Home', 'bin', EXE);
  try { await fsp.access(bin); if (process.platform !== 'win32') await fsp.chmod(bin, 0o755); return bin; }
  catch { await fsp.chmod(mac, 0o755).catch(() => {}); return mac; }
}

/* Version JSON tells us which Java it wants; modern versions ask for 21. */
async function ensure(version, override, onProgress = () => {}) {
  if (override) return override;
  const major = (version.javaVersion && version.javaVersion.majorVersion) || 21;
  const found = await find(major);
  if (found) return found;
  onProgress({ stage: 'java', pct: 6, detail: `Java ${major} not found on this PC` });
  return fetchJre(major, onProgress);
}

module.exports = { ensure, find, probe };
