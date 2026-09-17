# Performance in Monkey Client 0.9

The launcher matches optimization releases to the **exact Minecraft version and loader**, verifies their checksums, and keeps its managed optimization files separate from player-installed mods. Profile settings → Performance offers Balanced (default), Maximum, and Off. Changes apply on the next launch. Player graphics settings are preserved.

The catalog was checked against the publishers' Modrinth releases on September 17, 2026. `electron/game/performance-catalog.json` records version IDs and hashes. Forge and NeoForge are different loaders; a NeoForge release is never installed into Forge.

| Minecraft | Fabric Balanced, in addition to bundled Sodium | Fabric Maximum extras | Forge |
| --- | --- | --- | --- |
| 26.3 | Lithium, ImmediatelyFast, Dynamic FPS | BadOptimizations | No Forge release available |
| 26.2 | Lithium, FerriteCore, ImmediatelyFast, Entity Culling, Dynamic FPS | More Culling + Cloth Config, BadOptimizations | No exact compatible optimization releases in this catalog |
| 26.1 / 26.1.1 / 26.1.2 | Lithium, FerriteCore, ImmediatelyFast, Entity Culling, Dynamic FPS | More Culling + Cloth Config, BadOptimizations | No exact compatible optimization releases in this catalog |
| 1.21.11 | Lithium, FerriteCore, ImmediatelyFast, Entity Culling, Dynamic FPS | More Culling + Cloth Config, BadOptimizations | No exact compatible optimization releases in this catalog |
| 1.21.9 / 1.21.10 | Lithium, FerriteCore, ImmediatelyFast, Entity Culling, Dynamic FPS | BadOptimizations | Entity Culling |

## What the optimizations do

- [Sodium](https://github.com/CaffeineMC/sodium) replaces the terrain renderer. It is already bundled in the Fabric Monkey Client artifact; the launcher does not add a second copy.
- [Lithium](https://github.com/CaffeineMC/lithium) optimizes game logic and integrated-server work while preserving vanilla mechanics.
- [FerriteCore](https://github.com/malte0811/FerriteCore) reduces memory used by common game data. Lower memory use does not necessarily increase average FPS.
- [ImmediatelyFast](https://github.com/RaphiMC/ImmediatelyFast) improves immediate-mode rendering, including GUI and entity workloads.
- [Entity Culling](https://github.com/tr7zw/EntityCulling) skips entities hidden behind geometry. Its benefit depends on what is hidden in the scene; unusual mod renderers may need its exclusions.
- [Dynamic FPS](https://github.com/juliand665/Dynamic-FPS) reduces work when a game is in the background. This is useful for multiple instances; it is not a foreground FPS booster.
- Maximum adds available stable releases of [More Culling](https://github.com/FxMorin/MoreCulling) and [BadOptimizations](https://github.com/ItsThosea/BadOptimizations). Extra culling and cached lighting can have visual tradeoffs, so they are optional.

ModernFix, Embeddium and Enhanced Block Entities were also checked; no exact compatible releases were selected for the supported combinations. Beta-only releases were excluded. This is a reviewed set of available methods, not a claim that every possible optimization has been discovered.

## Hardware and settings

For an uncapped benchmark, disable VSync and select Unlimited Max Framerate in Minecraft. Fullscreen resolution, render distance, simulation distance, shaders, resource packs, entity counts and world generation all affect the result. Reduce them only when the visual tradeoff is acceptable. Keep cloud quality, particles, biome blending and entity distance at the quality you prefer; Monkey Client does not silently lower them.

Use the exact Java major required by Minecraft and a runtime matching your CPU architecture. The launcher selects and downloads these automatically. Default G1 collection settings are retained; large speculative JVM flag lists and allocating all system RAM can worsen pauses. Start with the normal 4 GB allocation and increase it only when your modpack needs more. Close unused game instances and expensive background programs when measuring foreground FPS. Use current GPU drivers from the GPU vendor, and select the dedicated GPU for Java on dual-GPU laptops if needed.

The launcher itself uses a reusable GPU player renderer, bounded canvas resolutions and image caches, adaptive frame pacing, and pauses animation in hidden windows. A software fallback remains available. This reduces launcher overhead; it does not remove Minecraft's CPU/GPU limits.

## Repeatable comparison

1. Use a copy of the same world, the same view position, resolution and graphics settings. Let chunks finish loading and Java warm up for at least a minute.
2. Compare Off, Balanced and Maximum after restarting the instance for each change. Run the same route three times, including an entity-heavy area and normal terrain.
3. Record average FPS, frame-time spikes, CPU/GPU usage and memory. Prefer smoother frame times over a brief peak in an empty scene.
4. Compare screenshots to check that a preset preserves the appearance you want. Return to Balanced or disable a conflicting mod if needed.

The release checks create a fresh world, enable Monkey Client modules, open menus and capture a 4K frame with the compatible optimization set. CI uses software graphics and verifies compatibility; it is not a player-hardware FPS benchmark. **2,000 FPS cannot be guaranteed** and is not an appropriate promised result across different hardware, worlds and settings.
