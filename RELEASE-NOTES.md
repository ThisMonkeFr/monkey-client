# Monkey Client 0.10.0 / mod 0.8.0

## Flight and game controls

- Creative flight uses a stable vanilla base: 10x means ten times the base speed, without compounding server updates. Disabling boost restores normal speed. Joining a single-player creative world also resets a boosted speed left in the save by an older version, even with Sprint disabled.
- The 26.3 mouse-button adapter fixes the waypoint color wheel and crosshair pixel editor. Waypoints have independent block and world-label visibility switches, with compact controls for small windows.
- Zoom fades the crosshair faster. F2 keeps the capture animation and thumbnail without posting the success message in chat; capture errors remain visible.

## Friends, screenshots and skins

- Friends, Screenshots and Skins are available inside the mod menu using the launcher's complete interface. The menu opens on Mods; Home is removed from navigation.
- Keep the launcher running while using these in-game tabs or sharing profile codes. The launcher can be hidden. A per-instance authenticated loopback connection carries the interface; Microsoft and Minecraft credentials remain in the launcher process.
- Group chats show members on the right with Add friend controls. Messages show the author's name and avatar.
- The screenshot gallery supports deletion and archives captures outside instance folders. Deleting a launcher profile preserves its screenshots. Explicit screenshot deletion removes both the gallery copy and its existing original.

## Profiles, accounts and mods

- Profiles shows the active configuration and includes the supplied PvP and Hoplite presets. Import and Share use chosen 4–24-character codes. Codes are case insensitive and globally unique; taken codes cannot be overwritten. Sharing requires MonkeyNet sign-in.
- Add account offers Microsoft sign-in in a dedicated Microsoft window or the existing device-code flow. The Microsoft window handles passwords; the launcher exchanges an authorization code using PKCE.
- Creating a profile installs its managed mods. Installed Mods lists Monkey Client, Fabric API, bundled Sodium and the chosen optimization mods. Required dependencies are resolved recursively for the selected loader/version and presented for approval before installation.
- Launcher text encoding, navigation icons and the player hover outline are corrected. In-game and desktop saves preserve unrelated changes made in the other interface.

## Distribution and validation

Eight Fabric and seven Forge builds cover 26.3, 26.2, 26.1.2, 26.1.1, 26.1, 1.21.11, 1.21.10 and 1.21.9; Forge 26.3 remains unavailable upstream. Each artifact has a version/loader-specific checksum.

Automated checks cover flight, restoration, input editors, fresh worlds, resources, menus, 4K capture, launcher UI and backend access controls. Tests use isolated accounts/data and never send messages to real friends. Microsoft password sign-in requires account-owner acceptance testing. The supplied older 26.3 log contains shader errors already fixed in mod 0.7.0; its final native exit does not identify a definitive cause. These checks do not establish hardware FPS or every multiplayer/mod-pack combination.

Existing installations receive the launcher update automatically. Close the launcher when the update is ready; the matching mod is installed automatically before the next game launch. Players do not need another setup download.
