# Monkey Client

A Minecraft-styled launcher with a themeable Monkey interface. Electron shell, Modrinth-backed mod browser,
Microsoft account sign-in, and a friends system.

## Running it

```bash
npm install
npm start
```

`renderer/index.html` also opens directly in a browser. Everything that does not
need the OS still works there, which makes UI iteration fast.

## Layout

```
electron/
  main.js        window, IPC, session refresh
  preload.js     the only bridge between the page and Node
  auth.js        Microsoft -> Xbox Live -> XSTS -> Minecraft
  minecraft.js   profile, skin upload, session join
  monkeynet.js   friends server client
  store.js       encrypted session + launcher data
  game/
    io.js        paths, verified downloads, archives, OS rules
    install.js   version manifest, libraries, assets, Fabric and Forge
    java.js      detect a runtime, or fetch one from Adoptium
    launch.js    argument building and spawning the game
renderer/
  index.html     the whole UI, one file
```

## Where files live

```
<userData>/shared/              assets, libraries, versions, java
<userData>/instances/<profile name>/      saves, mods, config, natives
```

Profiles have separate worlds and mods. New profiles inherit selected settings and packs from the current profile. Immutable game files are shared. Concurrent copies of one profile keep separate worlds under its `sessions/` directory.

## Java

The launcher reads the required major version out of the version manifest,
looks for a matching runtime on PATH, in `JAVA_HOME`, and in its own shared
folder, and downloads a JRE from Adoptium only if nothing suitable is found.
A profile can override this with an explicit path in its settings.

## Security choices

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
  The page gets a fixed list of functions through `preload.js` and nothing else.
- The Minecraft access token never reaches the renderer. Skin uploads and
  MonkeyNet identity happen in the main process.
- The refresh token is encrypted with the OS keychain (`safeStorage`). If no
  keychain is available, nothing is written rather than storing it in plain text.
- External links open in the real browser, never in an app window.

## Status

Done: launcher UI, profiles and per-profile settings, Modrinth browsing and
install resolution, skin management, friends and messaging, Microsoft sign-in,
game installation and launching.

The integrated in-game client is included for all supported Fabric and Forge profiles.

## Automatic updates

Install once from [Releases](https://github.com/ThisMonkeFr/monkey-client/releases/latest). The installed launcher downloads new launcher releases and installs them when it exits or you select the update action. It also checks [monkey-client-mod](https://github.com/ThisMonkeFr/monkey-client-mod/releases/latest) before starting Minecraft and installs the matching mod automatically. The two repositories allow launcher and mod updates to ship separately; players do not need to manage them. See [RELEASING.md](RELEASING.md) for publishing instructions and platform requirements.

## Version 0.5.0

- Six refined biome palettes: Jungle, Volcano, Abyss, Amethyst, Ember and Frost; updated player stage, navigation and controls.
- `renderer/model.js` performs depth-tested skin/cape rendering, correct outer-layer alpha, legacy/slim UV handling, cape pivot motion and hover outlines. `renderer/theme-polish.css` contains the updated layout/theme rules.
- Fabric 26.2 profiles automatically receive bundled Monkey Client 0.3.0 and Fabric API. The bundle is SHA-256 checked; newer releases can still update it.
- `electron/game/cosmetics.js` exports the selected cape and theme per instance before launch. Custom capes are currently local to that player's client; this is not a network cape-distribution service.
- Run `npm test`: 19 tests cover rendering, cape/theme export and managed-mod installation. `npm run dist -- --win --publish never` builds the Windows installer.
- The launcher preview was visually checked. Live Minecraft graphics and multiplayer compatibility still need in-game acceptance testing; see the mod README.

## Version 0.6.0

See RELEASE-NOTES.md for the mod 0.4.0 bundle, saved themes, detailed backgrounds, 50 Minecraft block icons, 3D skin heads and account persistence fixes. Run npm test for the regression suite.

## Release 0.7.0

The default font is Minecraft. Full-page animated backgrounds follow the current accent on every tab. Profile settings include Change version, which updates installed mods and collects unavailable builds in one Disable/Delete dialog. New profiles inherit the currently selected profile's options, shader configuration, resource packs and shader packs without moving the originals.

The launcher bundles Monkey Client 0.5.0 for eight Fabric and seven Forge combinations. `bundled/monkeyclient.json` pins each artifact to one Minecraft version and loader with a SHA-256 hash. Forge 26.3 is unavailable upstream and is not offered. Run `npm test` for launcher regressions and `npm run dist -- --win nsis --x64 --publish never` to produce the Windows installer. The source archive includes the matching mod JARs.

## Release 0.8.0

Monkey is the default menu style; top and side navigation follow your theme. Screenshots brings every saved profile's captures into one gallery, and the integrated mod captures F2 screenshots at 4K. Multiple profiles can run together after confirmation. Profile deletion removes its managed instance files, and updates use a larger download/install dialog.

Launch fixes cover the exact Java major, native CPU filtering, Fabric library overrides, Forge startup, and full crash logs. The launcher bundles all 15 Monkey Client 0.6.0 builds. Run `npm test` for 51 regression checks. The manually dispatched Runtime verification workflow checks the renderer and launches version-specific clients in a virtual display.

## Release 0.9.0

Same-profile concurrent launches, human-readable instance folders, inherited in-game module profiles, screenshot messages and required-name/icon group chats are included. The player preview uses a reusable GPU renderer, sharper artwork and theme glow with adaptive frame pacing. All 15 bundled mod builds are version 0.7.0.

Profile settings offer exact-version performance presets; see [PERFORMANCE.md](PERFORMANCE.md). Run `npm test` for 58 regression tests. Runtime verification creates fresh worlds, enables modules, checks textures and the actual pause-menu/settings buttons, and captures a 4K frame. See [RELEASE-NOTES.md](RELEASE-NOTES.md) for scope and limitations.
