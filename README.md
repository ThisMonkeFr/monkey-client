# Monkey Client

A personal, non-commercial Minecraft: Java Edition launcher with a jungle theme.
Built with Electron.

## What it does

- Manages multiple game profiles, each with its own Minecraft version, mod
  loader, mods and settings
- Browses and installs mods directly from Modrinth
- Manages skins
- Friends list and direct messaging between players
- Signs players into their own Microsoft accounts to launch the game

## Authentication

Sign-in uses the standard Microsoft device-code flow with the `XboxLive.signin`
scope, exchanged through Xbox Live and XSTS for a Minecraft token. Passwords are
never entered into the application — sign-in happens on Microsoft's own page.
Refresh tokens are encrypted with the operating system keychain.

No authentication, license, or ownership check is bypassed or weakened. Accounts
that do not own Java Edition are rejected.

## Status

In development. Launcher UI, profiles, mod installation and account sign-in are
implemented. Game launching is next.
