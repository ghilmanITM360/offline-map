# Data, Privacy and Retention

Engineering description of what the app stores and sends, using the retention defaults the project owner authorised on 2026-10-05 (#145). It describes what the app *does*; it is **not** the legal privacy policy. The Privacy Policy, Terms and support links are owner-provided facts (#47) and are not written here or anywhere in the repo: the About screen's links are unset placeholders that tell the user "This link isn't ready". Do not draft placeholder legal text and ship it as final (`AGENTS.md`). Release/signing/permission facts: [`RELEASE_SECURITY_PRIVACY.md`](RELEASE_SECURITY_PRIVACY.md).

## Privacy posture (SOURCE)

- **No server-side user data.** There is no user account, analytics or crash-reporting backend in the app. Everything is app-internal storage (AsyncStorage / the app document directory); nothing sensitive goes to shared storage.
- **Location is foreground-only and optional.** `expo-location` foreground permission only (no background location). It is requested in context (live guidance, "use my location", recenter), never at launch, and a user who declines is not asked again unprompted. Permission and its precision (precise/approximate) are read from the OS each time and are **not stored by the app**.
- **No movement history.** GPS fixes drive the live session in memory only; no trail or route samples are ever persisted.
- **Network.** Core features make no network requests (EMULATOR sampled: 0 remote sockets through a full flow; see `TESTING.md`). The app polls the OS network state only. The one optional outbound path is the walking-routes proxy: when (and only when) `EXPO_PUBLIC_IJTEMA_ROUTING_PROXY_BASE_URL` is set **and** `EXPO_PUBLIC_ENABLE_GOOGLE_ROUTING_DIAGNOSTIC=true`, an outside route request sends the start coordinate and candidate gate ids to that proxy. The proxy is not deployed (#123), so this does not happen in any build today. If it is ever enabled, third-party transfer and logging need owner-approved disclosure (`backend/walking-proxy/README.md`).
- **Share** hands a place name and an OpenStreetMap link (with the place's coordinates inside the link) to the system Sharesheet only when the user taps Share; the app sends nothing itself.
- **Backup.** Android auto-backup and device transfer exclude the whole AsyncStorage database (`RKStorage`; `data_extraction_rules.xml` and `backup_rules.xml`), because it also holds the last-known location and the recovery marker, which must not silently restore onto another device (#58). EMULATOR VERIFIED on the backup and restore paths with the local backup transport; physical-device backup/restore not run. Android backup exclusion is file-granular, so the language choice and favorites are excluded too.

## What is stored

| Data | Where | Class | Retention | Clear |
|---|---|---|---|---|
| Movement history / GPS trail / route samples | never persisted | - | none | n/a |
| Active route, progress, snapped/current position, Route Guide steps, pending Directory journey, arrival latch | memory only | transient | process lifetime | n/a |
| Last known location (one fix, `lastKnownLocation*`) | `ijtema-app-store` | sensitive | **24 h**, then dropped on write and on read | Settings > Privacy > Clear Saved Location (a live GPS fix saves a new one afterwards) |
| Recent searches (<= 10 stored, `recentSearches`, `recentSearchTimes`; the Directory shows 5) | `ijtema-app-store` | search history | **30 days per entry** | Settings > Privacy > Clear Recent Searches (and Clear in the Directory's Recent list) |
| Unfinished-journey marker (destination id + time, no coordinates) | `ijtema-app-store` | recovery marker | **2 h** | Settings > Privacy > Clear unfinished journey (or Dismiss on the Directory card) |
| Favorites, settings (voice, distance unit), map-layer toggles, tutorial flags | `ijtema-app-store` | user preference | until the user changes them or uninstalls | not wiped by any clear |
| App language (`ijtema-locale-v1`) | AsyncStorage | preference | until uninstall | not wiped |
| Welcome seen (`ijtema.onboarding.welcome_seen.v1`) | AsyncStorage | preference | until uninstall | not wiped |
| Bundled basemap copy (`map/ijtema-basemap-<sha12>.pmtiles`) | app document dir | bundled asset copy | rebuilt from the APK asset whenever it is missing or its SHA-256 does not match the manifest; older versions are deleted | none needed (self-healing; Clear Data removes it and the next app start recopies it) |

Builds before the contextual-permission change also stored `ijtema.onboarding.location_permission_skipped.v1`; nothing reads it any more and an old value is ignored. Builds before the bundled basemap stored `ijtema.offline_map.*` keys and a `tiles/` directory; nothing reads or removes them (harmless leftovers on upgraded devices).

## Rules enforced in code

`src/utils/dataRetention.ts` and `useAppStore` apply the policy in `partialize` on every write and `merge` on every read. The unfinished-journey marker is expired by `merge` and by the read selector (`selectUnfinishedJourney`), not by `partialize`, so an in-memory marker older than 2 h can still be written until the next read drops it. An unparseable, missing or future-dated timestamp, or an unusable coordinate, fails closed (the data is dropped). A persisted blob from before this policy (no recent-search stamps) is kept and its 30-day clock starts at first launch. Unknown keys and unknown schema versions are whitelisted away. Clears are targeted: favorites, settings, language and the welcome flag are never touched by the three Privacy actions, and `AsyncStorage.clear()` is deliberately not used (it would erase host-owned keys and let in-memory state repopulate).

Process death, force-stop, Clear Data and reinstall all start at Splash -> Welcome (first time) -> Directory; the only navigation fact that survives a process death is the coordinate-free marker, and nothing resumes by itself.

## Evidence

SOURCE/RUNTIME: `src/__tests__/LocalDataRetention.test.ts`, `SettingsScreen.test.tsx`, `UnfinishedJourneyMarker.test.ts`, `useAppStoreProcessDeath.test.ts`. A device smoke test of the Clear actions is PHYSICAL DEVICE REQUIRED. Google Play Data-Safety wording and any store privacy disclosure stay owner tasks.
