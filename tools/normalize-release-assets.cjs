// gh uploads spaces as dots; electron-updater's manifests use hyphens.
const fs = require('node:fs');
const path = require('node:path');
const dir = path.resolve(process.argv[2] || 'release');
for (const name of fs.readdirSync(dir)) {
  if (!name.includes(' ')) continue;
  const target = path.join(dir, name.replace(/ /g, '-'));
  if (fs.existsSync(target)) throw Error('Duplicate release asset: ' + target);
  fs.renameSync(path.join(dir, name), target);
}
