/* Building the launch command and running it. */
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const io = require('./io');
const { instance, shared, allowed, fsp } = io;
const install = require('./install');
const java = require('./java');

const SEP = process.platform === 'win32' ? ';' : ':';

function substitute(arg, vars) {
  return arg.replace(/\$\{(\w+)\}/g, (_, k) => (k in vars ? vars[k] : `\${${k}}`));
}

function flatten(argList, vars, features) {
  const out = [];
  for (const a of argList || []) {
    if (typeof a === 'string') { out.push(substitute(a, vars)); continue; }
    if (!allowed(a.rules, features)) continue;
    const v = Array.isArray(a.value) ? a.value : [a.value];
    out.push(...v.map(x => substitute(x, vars)));
  }
  return out;
}

async function unpackNatives(natives, dir) {
  await io.ensureDir(dir);
  for (const n of natives) {
    await io.unzip(n.file, dir).catch(() => {}); // duplicate entries across jars are normal
  }
}

async function prepare(profile, account, onProgress) {
  const gameDir = profile.settings.gameDir || instance(profile.id);
  await io.ensureDir(path.join(gameDir, 'mods'));

  const built = await install.install(profile.version, profile.loader, onProgress);
  const { version, resolved } = built;

  onProgress({ stage: 'java', pct: 86, detail: 'Locating a Java runtime' });
  const javaBin = await java.ensure(version, profile.settings.customJava && profile.settings.javaPath, onProgress);

  onProgress({ stage: 'natives', pct: 92, detail: 'Unpacking native libraries' });
  const nativesDir = path.join(gameDir, 'natives');
  await unpackNatives(built.natives, nativesDir);

  const vars = {
    natives_directory: nativesDir,
    launcher_name: 'monkey-client',
    launcher_version: require('../../package.json').version,
    classpath: built.classpath.join(SEP),
    classpath_separator: SEP,
    library_directory: shared('libraries'),
    auth_player_name: account.name,
    version_name: version.id,
    game_directory: gameDir,
    assets_root: shared('assets'),
    assets_index_name: built.assetIndex,
    auth_uuid: account.uuid,
    auth_access_token: account.accessToken,
    auth_xuid: account.xuid || '',
    clientid: '',
    user_type: 'msa',
    version_type: version.type,
    resolution_width: String(profile.settings.width || 1280),
    resolution_height: String(profile.settings.height || 720)
  };
  const features = { has_custom_resolution: !profile.settings.fullscreen, is_demo_user: false };

  const jvm = [
    `-Xmx${profile.settings.ram || 4096}M`,
    `-Xms${Math.min(1024, profile.settings.ram || 4096)}M`,
    ...(profile.settings.customArgs && profile.settings.javaArgs
        ? profile.settings.javaArgs.split(/\s+/).filter(Boolean)
        : ['-XX:+UseG1GC', '-XX:+ParallelRefProcEnabled', '-XX:MaxGCPauseMillis=50']),
    ...flatten(version.arguments && version.arguments.jvm, vars, features),
    ...flatten(resolved.extraJvm, vars, features)
  ];
  // Very old versions have no jvm argument block at all.
  if (!version.arguments) jvm.push('-cp', vars.classpath);

  /* Some version manifests no longer emit -Djava.library.path. Without it the
     JVM has nowhere to find lwjgl.dll and the game dies before opening a
     window, so add it ourselves when it is missing. */
  if (!jvm.some(a => String(a).startsWith('-Djava.library.path')))
    jvm.unshift('-Djava.library.path=' + nativesDir);
  if (!jvm.some(a => String(a).startsWith('-Dorg.lwjgl.librarypath')))
    jvm.unshift('-Dorg.lwjgl.librarypath=' + nativesDir);
  if (!jvm.includes('-cp') && !jvm.includes('-classpath'))
    jvm.push('-cp', vars.classpath);

  const game = version.arguments
    ? [...flatten(version.arguments.game, vars, features), ...flatten(resolved.extraGame, vars, features)]
    : (version.minecraftArguments || '').split(' ').filter(Boolean).map(a => substitute(a, vars));

  if (profile.settings.fullscreen) game.push('--fullscreen');

  return { javaBin, args: [...jvm, resolved.mainClass, ...game], gameDir };
}

/* Spawns the game. Everything it prints is mirrored to a log file so a crash
   can be read after the fact instead of guessed at. */
async function launch(profile, account, onProgress, onEvent) {
  const { javaBin, args, gameDir } = await prepare(profile, account, onProgress);
  onProgress({ stage: 'starting', pct: 99, detail: 'Starting Minecraft' });

  const logDir = path.join(gameDir, 'logs');
  await io.ensureDir(logDir);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const logPath = path.join(logDir, `monkey-${stamp}.log`);
  const log = fs.createWriteStream(logPath, { flags: 'a' });

  const header = [
    `Monkey Client launch log`,
    `when      ${new Date().toString()}`,
    `profile   ${profile.name}`,
    `version   ${profile.version} (${profile.loader})`,
    `mods      ${(profile.mods || []).map(m => m.fileName).join(', ') || 'none'}`,
    `java      ${javaBin}`,
    `memory    ${profile.settings.ram} MB`,
    `gameDir   ${gameDir}`,
    ``,
    `command:`,
    `${javaBin} ${args.join(' ')}`,
    ``,
    `--- game output ---`, ``
  ].join('\n');
  log.write(header);

  /* Detached on every platform, so closing the launcher never takes the game
     with it. javaw has no console, so a new process group is invisible. */
  const child = spawn(javaBin, args, {
    cwd: gameDir,
    detached: true,
    windowsHide: false,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.unref();
  let started = false;
  const tail = [];                       // last lines, for the crash dialog

  const watch = (buf) => {
    const text = buf.toString();
    log.write(text);
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue;
      tail.push(line);
      if (tail.length > 250) tail.shift();
      onEvent({ type: 'log', line });
      if (!started && /Setting user:|LWJGL Version|Backend library|OpenAL initialized/.test(line)) {
        started = true;
        onEvent({ type: 'running' });
      }
    }
  };
  child.stdout.on('data', watch);
  child.stderr.on('data', watch);

  child.on('error', e => {
    log.write(`\n[launcher] could not start Java: ${e.message}\n`);
    log.end();
    onEvent({ type: 'error', message: `Could not start Java: ${e.message}`, logPath });
  });

  child.on('close', code => {
    log.write(`\n--- exited with code ${code} ---\n`);
    log.end();
    /* Java reports crashes as unsigned on Windows; -1 shows as 4294967295.
       Normalise so the message means something. */
    const signed = code > 2147483647 ? code - 4294967296 : code;
    onEvent({
      type: 'exit', code: signed, logPath,
      crashed: signed !== 0,
      tail: signed !== 0 ? tail.slice(-60) : []
    });
  });

  setTimeout(() => { if (!started && child.exitCode === null) { started = true; onEvent({ type: 'running' }); } }, 6000);

  return { pid: child.pid, logPath, kill: () => child.kill() };
}

module.exports = { launch, prepare };
