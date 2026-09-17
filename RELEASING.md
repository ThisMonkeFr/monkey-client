# Publishing launcher updates

Players install the launcher once. Installed builds check this repository's latest stable GitHub release on startup and every six hours, download the update, and install it when the launcher exits or the player selects the update action. Development runs with `npm start` do not auto-update. macOS automatic updates require signed application builds; signing credentials are not configured in this repository.

1. Update `package.json`, its lockfile, `RELEASE-NOTES.md`, and any bundled mod files/catalog.
2. Run `npm ci` and `npm test`.
3. Commit and push, then push a tag matching the package version, such as `v0.7.0`. Alternatively run the Release workflow manually on the intended commit.
4. The workflow builds Windows x64, macOS arm64, and Linux x64. It verifies the binaries against `latest.yml`, `latest-mac.yml`, and `latest-linux.yml`, uploads everything to a draft, then publishes only after all platforms succeed. It refuses to overwrite a published release.

Keep the installer, blockmaps, and update YAML files together. Uploading source code or a setup executable alone does not publish an automatic update. Do not replace published binaries without updating their hashes and version.

## The separate mod release

`electron/config.js` points at [monkey-client-mod](https://github.com/ThisMonkeFr/monkey-client-mod). Before a modded game launches, the launcher checks that repository for `monkeyclient.json`, selects an exact Minecraft version/loader, and verifies the referenced JAR's SHA-256. Compatible bundled JARs are the fallback. Players do not have to visit or download from the mod repository themselves.

The two repositories let the mod update independently from the launcher. Every mod release must include its catalog and all referenced JARs. Follow the mod repository's release instructions, including the compatibility asset for older launchers.
