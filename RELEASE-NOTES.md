# Monkey Client 0.7.0 / mod 0.5.0

## Modules and the in-game menu

- Coordinates-only debug mode now cancels the rest of Minecraft's position group and shows XYZ only.
- Zoom scales the world, main hand, offhand and HUD together. Opacity remains unchanged.
- Toggle Sprint's creative-flight speed setting reaches 100.
- World Editor synchronizes render distance with native video settings in both directions.
- Container Preview defaults to previewing without Shift. Hold Alt + Left Control over a container to pin its read-only inventory preview and inspect item tooltips; the inspection key can be rebound. Keep both keys held while inspecting.
- Waypoints has exactly 20 Minecraft block-texture icons and a configurable manager key, M by default.
- MCPVP can show the selected kit or best kit tier. The best-across-tierlists option compares gamemodes from MCTiers, SubTiers and MCPVP.
- Vanilla is the default menu theme: gray inventory panels, native widgets, a compact module grid and side-by-side settings/preview. Custom styling and launcher accent matching remain available.
- Hold Right Shift for 0.3 seconds for the animated landing menu. Promotional slogans and the hold-time footer are removed.
- The Mod Profiles tab supports create, apply, save, copy, rename, delete, and clipboard import/export.

## Launcher and profiles

- Vanilla-styled controls, square panels, and Minecraft font by default. Explicit existing font choices are preserved.
- Backgrounds extend behind the whole content area, including the updates and troop panels, on every tab. All animated effects follow the selected or custom accent.
- Frozen Glass has etched cracks, edge frost and moving light; Rift Lattice replaces Digital DNA; Cloudscape uses voxel clouds, stepped terrain, trees and a square sun.
- Update-panel text and its footer now flow without overlap, including at the minimum 1000×680 window size.
- New profiles copy options.txt, optionsof.txt, optionsshaders.txt, Iris/Oculus/shader properties, resource packs and shader packs from the selected profile. Originals remain in place; existing destination files are preserved. Close a running source instance first so its latest options are saved.
- Profile Settings → Installation → Change version checks every installed JAR, including manually added files. Matching mods and required dependencies update together. Only unavailable/unidentified mods appear in the shared Disable/Delete dialog, with per-mod choices and Disable all/Delete all.
- Version changes stage downloads, verify hashes, back up the original mods/options/profile and roll back the mods directory if saving fails. Backups are in the profile's backups/version-change-* folder.
- The launcher chooses a Monkey Client JAR by exact Minecraft version and loader, verifies its SHA-256, and refuses to substitute another version's build. Bundled artifacts work when the release server is unavailable; first-time game/Fabric API installation still needs the network.

## Version matrix

| Minecraft | Java | Fabric Loader | Forge |
|---|---:|---|---|
| 26.3 | 25 | 0.19.5 | Not released upstream |
| 26.2 | 25 | 0.19.5 | 65.1.0 |
| 26.1.2 | 25 | 0.19.5 | 64.1.0 |
| 26.1.1 | 25 | 0.19.5 | 63.0.2 |
| 26.1 | 25 | 0.19.5 | 62.0.9 |
| 1.21.11 | 21 | 0.19.5 | 61.2.0 |
| 1.21.10 | 21 | 0.19.5 | 60.1.0 |
| 1.21.9 | 21 | 0.19.5 | 59.0.5 |

All eight Fabric combinations and seven available Forge combinations have separate Monkey Client 0.5.0 builds. The launcher also supports vanilla profiles; Minecraft cannot load a mod without a mod loader.

Fabric builds bundle the corresponding Sodium renderer. There is no official Sodium Forge artifact for these versions, so Forge uses Minecraft's native renderer and its 32-chunk render-distance limit. Extended terrain caching/rendering to 1000 chunks remains a Fabric/Sodium feature.

## Verification and limits

- All 15 combinations compile to the required Java version and pass native class/method/field/injection-site audits. The three 1.21.x Fabric JARs also pass audits after remapping to runtime intermediary names.
- 193 mod regression checks and 322 additional native/cache/resource checks pass against 26.2.
- 41 launcher tests pass, including exact-build selection, artifact corruption, profile inheritance, local-mod compatibility, migration failure recovery, account persistence and model rendering.
- Forge's official installers completed for all seven supported versions, and the Forge mod audits use their patched game classes.
- The distributed fresh-download source build script was executed successfully for 26.2 Fabric.
- Launcher layout, font, theme effects, full-content background, profile creation and version controls were checked in a browser, including the minimum window size. No browser console errors were observed.

A live Minecraft world/GPU session has not been validated in this environment. Shader-pack and third-party mod combinations still need in-game testing. Container inspection is read-only and only displays contents the client has received. Custom capes remain local cosmetics. Back up important worlds before opening them in another Minecraft version; mod migration does not convert world saves.

Existing installed launchers download this update automatically and install it when the launcher exits or you select the update action. New players can install Monkey Client Setup 0.7.0.exe once. The launcher bundles all 15 mod builds and checks for future compatible mod updates before starting Minecraft. macOS automatic updates require signed application builds; signing is not configured for these builds.
