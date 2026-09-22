# Android Permissions

Ground truth for what actually ships is the checked-in, git-tracked
`android/app/src/main/AndroidManifest.xml` — **not** `app.json`. This repo
commits the native `android/` project, so it does not get freshly regenerated
from `app.json` on every build; `app.json`'s `android.permissions` array only
takes effect on the next `npx expo prebuild` (or `--clean`) run, and even then
it only *adds* permissions on top of whatever autolinked modules already
contribute — it cannot remove an autolinked module's own permission.

## Current merged manifest

| Permission | Source | Justification |
|---|---|---|
| `INTERNET` | explicit, `app.json` | network calls, tile/asset fetch |
| `ACCESS_NETWORK_STATE` | explicit, `app.json` | `ConnectivityService` online/offline detection |
| `ACCESS_FINE_LOCATION` | autolinked — `expo-location` module manifest, triggered by the `expo-location` plugin config in `app.json` | GPS position for map/nav (`GPSManagerService`, `LocationAccessService`) |
| `ACCESS_COARSE_LOCATION` | autolinked — same as above | fallback location accuracy |

## Removed

- **`VIBRATE`** — removed 2026-07. Was present in the checked-in manifest with
  no traceable source (not in `app.json`, not in any node_modules module
  manifest) and zero code usage (`Vibration`/`Haptics`/`expo-haptics` absent
  from `src/` and `package.json`). Likely a stale leftover from a prior/removed
  dependency or a manual edit. If a future dependency needs it again, it will
  reappear via autolinking or must be re-added explicitly to `app.json`.
- **`READ_EXTERNAL_STORAGE` / `WRITE_EXTERNAL_STORAGE`** — removed 2026-09
  (#81). `expo-file-system`'s own module manifest
  (`node_modules/expo-file-system/android/src/main/AndroidManifest.xml`)
  unconditionally declares both, but the app only touches app-internal
  storage via the modern `Directory`/`File`/`Paths` API (`Paths.document`,
  see `OfflineMapService`/`DownloadMapViewModel`), which needs neither
  permission on any supported Android version, and `WRITE_EXTERNAL_STORAGE`
  is already a no-op for apps targeting API 30+. Since autolinking merges the
  library's manifest regardless of app.json, they're stripped explicitly with
  `tools:node="remove"` in `android/app/src/main/AndroidManifest.xml` rather
  than just deleted, otherwise the manifest merger would re-add them.

## Notes

- Do not remove the location permissions — they trace to a module the app
  actively depends on (`expo-location`) for GPS-based navigation.
- If `expo-file-system` is upgraded and starts requiring one of these
  permissions for the APIs actually in use (unlikely, but verify), the
  `tools:node="remove"` override in `AndroidManifest.xml` would need to be
  revisited.
- Re-verify this table any time `npx expo prebuild --clean` is run, a native
  dependency is added/removed, or `expo-location`/`expo-file-system` is
  upgraded — the merged permission set can shift silently since `android/` is
  checked in rather than regenerated fresh each build.
