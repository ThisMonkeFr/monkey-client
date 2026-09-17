# Monkey Client 0.9.0 / mod 0.7.0

## Game fixes and controls

- Forge receives version-correct resource-pack metadata so Monkey Client textures load. Cache files close safely during shutdown.
- Minecraft 26.3 motion-blur shaders declare the stage interfaces required by RenderPearl.
- The pause menu has a Monkey Client shortcut. Client Settings is centered vertically on the landing menu.
- Creative flight boost defaults to holding Left Alt. Choose another key or Automatic in Toggle Sprint settings. The integrated server stays synchronized; multiplayer servers still control permitted speed.
- Waypoints have an independent block color as well as a marker color.
- F2 captures a real 3840 by 2160 frame, flashes briefly and shows its thumbnail in the bottom-right for about two seconds.

## Profiles and performance

- Launch the same profile more than once after confirmation. Additional sessions use separate writable folders and worlds, with independent process controls and logs.
- Managed instance folders use profile names, with safe collision suffixes and migration of existing folders. Running folders are renamed after they stop; custom game directories remain player-managed.
- New profiles inherit the selected profile's Minecraft options, resource packs, shader packs, Monkey Client settings and named module profiles.
- Managed Monkey Client entries appear in the Mods tab for both loaders. Profile creation clearly highlights selected choices.
- Balanced, Maximum and Off performance presets install checksum-verified, exact-version optimization releases. Player-installed mods are preserved and duplicate mod IDs are avoided. See PERFORMANCE.md for the per-version catalog and tradeoffs. No preset silently reduces graphics settings, and 2,000 FPS is not guaranteed.
- The player preview uses a sharper GPU render with a software fallback, theme-colored glow, improved nameplate and new idle/walk/wave animations. Canvas sizes, caches and frame pacing are bounded; hidden animation pauses.

## Friends

- Attach screenshots from the gallery to direct messages or group conversations.
- Group creation requires a name, an icon and selected friends. Owners can edit group details and members can leave.
- The deployed MonkeyNet service checks conversation membership, attachment access and upload limits. No real friend messages were sent during testing.

## Distribution and verification

The launcher bundles mod 0.7.0 for eight Fabric and seven Forge combinations: 26.3, 26.2, 26.1.2, 26.1.1, 26.1, 1.21.11, 1.21.10 and 1.21.9. Forge 26.3 is unavailable upstream. Java 25 is used for 26.x and Java 21 for 1.21.x. Each bundle entry pins the exact game, loader and SHA-256.

All 15 variants compile and pass native mixin audits. The mod regression suites pass 210 checks plus 343 native/cache/resource checks; the launcher passes 58 tests. Backend integration tests run against PostgreSQL. Browser checks cover startup, themes, small windows, screenshots, profile creation and group conversations.

Runtime checks use fresh offline worlds on Linux with software graphics, enable all Monkey Client modules, click the pause-menu shortcut and Client Settings, and capture a 4K screenshot. These checks cover startup, world entry, resources and menu rendering; they do not establish hardware FPS, multiplayer movement or shader-pack compatibility.

Existing installs receive the launcher update automatically and apply it when the launcher closes. The matching mod updates automatically before Minecraft starts; players do not need to download it separately.
