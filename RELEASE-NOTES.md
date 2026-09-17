# Monkey Client 0.8.0 / mod 0.6.0

## Game launch fixes

- Select the exact Java major required by Minecraft: Java 21 for 1.21.x and Java 25 for 26.x. Windows uses java.exe with a hidden console so early errors are captured.
- Load and extract natives for the current operating system and CPU only. Fabric libraries replace older vanilla copies, fixing duplicate ASM failures on 1.21.9 and 1.21.10.
- Forge mod bytecode and mixin compatibility use Java 21, including builds for the Java 25 game. Early mod detection uses the discovery list before the runtime mod list exists.
- Optional Starlight targets no longer prevent startup when Starlight is absent.
- Java argument files avoid the Windows command-line length limit. Exported logs retain the full launch context with the access token redacted.

## Modules and menu

- Zoom smoothly fades the crosshair while preserving the opacity of both hands and the HUD.
- Creative flight keeps the integrated server's ability speed in sync and restores the original speed when disabled. Multiplayer servers still control permitted movement speeds.
- Custom elytra textures preserve Minecraft's normal wing transparency mask and geometry.
- Monkey replaces the Custom menu-style name and is the default. Vanilla remains available. The module grid uses smaller cards, more columns, full-name tooltips, and a panel height that fits the selected category.
- Right Shift opens the animated menu without drawing the corner-box hold indicator.
- F2 renders a real 3840 by 2160 image using a temporary UHD framebuffer; ordinary rendering resumes after capture. The Fabrishot-inspired capture implementation is included in every build, with MIT attribution.

## Launcher

- Monkey is the default menu style, with the top bar, sidebar, controls and panels following the selected or custom theme. Vanilla remains selectable. An animated loading screen stays visible until startup data and fonts are ready.
- Lower-resolution player previews, bounded texture/thumbnail caches, reduced animation frame rates, and paused off-tab/hidden work reduce rendering cost and retained memory.
- The Screenshots tab combines captures from saved profiles, with profile filtering, pagination, small thumbnails, Open and Show in folder.
- Starting another profile asks for confirmation. Each game has independent process state and logs; closing or crashing one leaves other instances running. The same profile or shared game folder cannot be opened twice.
- Deleting a profile removes its managed instance folder. Running/shared folders are protected, a failed profile save restores the folder, and external custom game directories are preserved.
- A prominent update dialog shows download progress, then offers Close and update. Existing Windows installs update without downloading setup again.

## Builds and verification

Eight Fabric builds and seven Forge builds are included for 26.3, 26.2, 26.1.2, 26.1.1, 26.1, 1.21.11, 1.21.10 and 1.21.9. Forge 26.3 remains unavailable upstream. Each artifact has an exact game/loader entry and SHA-256 in monkeyclient.json.

All 15 variants compile and pass native mixin audits. The 26.2 regression suites pass 203 checks plus 338 additional native/cache/resource checks. The launcher passes 51 tests covering version-specific artifacts, launch isolation, native/Java selection, profile deletion and rollback, screenshot pagination, rendering, migration and account persistence. Browser checks cover startup, the screenshot tab, settings, the orange theme and the minimum window size.

All 15 builds passed real startup and F2 capture at 3840 by 2160, with continued rendering after capture. Runtime verification uses isolated offline profiles on Linux with software graphics; it is not a multiplayer, world-flight or shader-pack compatibility test. Custom capes remain local cosmetics.
