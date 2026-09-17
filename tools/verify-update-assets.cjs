// Check the actual binaries referenced by electron-updater before publishing.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const dir = path.resolve(process.argv[2] || 'dist');
const version = require('../package.json').version;
const manifests = process.argv.slice(3);
if (!manifests.length) manifests.push('latest.yml', 'latest-mac.yml', 'latest-linux.yml');
const names = fs.readdirSync(dir);
for (const manifest of manifests) {
  const text = fs.readFileSync(path.join(dir, manifest), 'utf8');
  assert.equal(/^version:\s*(.+)$/m.exec(text)?.[1].trim(), version, manifest + ': wrong version');
  const entries = [...text.matchAll(/^\s+- url:\s*(.+)\r?\n\s+sha512:\s*(\S+)\r?\n\s+size:\s*(\d+)/gm)];
  assert(entries.length, manifest + ': missing file entries');
  for (const [, url, sha512, size] of entries) {
    const asset = url.trim().replace(/^['"]|['"]$/g, '');
    assert.equal(path.basename(asset), asset, 'Unsafe asset name');
    const name = names.find(n => n === asset || n.replace(/ /g, '-') === asset);
    assert(name, manifest + ': missing ' + asset);
    const data = fs.readFileSync(path.join(dir, name));
    assert.equal(data.length, Number(size), name + ': wrong size');
    assert.equal(crypto.createHash('sha512').update(data).digest('base64'), sha512, name + ': wrong hash');
    console.log(manifest + ': verified ' + name);
  }
}
