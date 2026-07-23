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
| `READ_EXTERNAL_STORAGE` | autolinked — `expo-file-system` module manifest | reading downloaded offline map data (`OfflineMapService`) |
| `WRITE_EXTERNAL_STORAGE` | autolinked — `expo-file-system` module manifest | writing downloaded offline map data (`DownloadMapViewModel`) |

## Removed

- **`VIBRATE`** — removed 2026-07. Was present in the checked-in manifest with
  no traceable source (not in `app.json`, not in any node_modules module
  manifest) and zero code usage (`Vibration`/`Haptics`/`expo-haptics` absent
  from `src/` and `package.json`). Likely a stale leftover from a prior/removed
  dependency or a manual edit. If a future dependency needs it again, it will
  reappear via autolinking or must be re-added explicitly to `app.json`.

## Notes

- Do not remove the storage or location permissions — both trace to modules
  the app actively depends on (`expo-file-system`, `expo-location`). If a
  future audit wants to scope storage access down (e.g. scoped storage / no
  legacy external storage), that requires migrating `OfflineMapService` off
  `expo-file-system`'s legacy external-storage APIs first, not just editing
  the manifest.
- Re-verify this table any time `npx expo prebuild --clean` is run, a native
  dependency is added/removed, or `expo-location`/`expo-file-system` is
  upgraded — the merged permission set can shift silently since `android/` is
  checked in rather than regenerated fresh each build.
