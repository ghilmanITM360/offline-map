# On-device data retention (#145)

Engineering policy using the defaults the project owner authorised on 2026-10-05. It describes
what the app *does*; it is not the legal privacy policy (owner-provided, see
`RELEASE_SECURITY_PRIVACY.md`). There is no server-side user data. Everything is app-internal
storage (AsyncStorage / app document directory); nothing sensitive goes to shared storage.
Android backup exclusions are already in place.

| Data | Where | Class | Retention | Clear |
|---|---|---|---|---|
| Movement history / GPS trail / route samples | never persisted | - | none | n/a |
| Active route, progress, snapped/current position, Route Guide steps, pending Directory journey, arrival latch | memory only | transient | process lifetime | n/a |
| Last known location (one fix, `lastKnownLocation*`) | `ijtema-app-store` | sensitive | **24 h**, then dropped on write and on read | Settings > Privacy > Clear Saved Location (a live GPS fix saves a new one afterwards) |
| Recent searches (<=10, `recentSearches`, `recentSearchTimes`) | `ijtema-app-store` | search history | **30 days per entry** | Settings > Privacy > Clear Recent Searches |
| Unfinished-journey marker (destination id + time, no coordinates) | `ijtema-app-store` | recovery marker | **2 h** | Settings > Privacy > Clear unfinished journey |
| Favorites, settings, map-layer toggles, tutorial flags | `ijtema-app-store` | user preference | until user changes/uninstall | not wiped by any clear |
| Welcome seen (`ijtema.onboarding.welcome_seen.v1`) | AsyncStorage | preference | until uninstall | not wiped |
| Bundled basemap copy (`map/ijtema-basemap-<sha12>.pmtiles`) | app document dir | bundled asset copy | rebuilt from the APK asset whenever it is missing or its SHA-256 does not match the manifest; older versions are deleted | none needed (self-healing; Clear Data removes it and the next app start recopies it) |

Location permission and its precision are **not stored by the app**: Splash and the contextual flows read them from the OS each time. Builds before the contextual-permission change also stored `ijtema.onboarding.location_permission_skipped.v1`; nothing reads it any more and an old value is ignored. Builds before the bundled basemap stored `ijtema.offline_map.*` keys and a `tiles/` directory; nothing reads or removes them (they are harmless leftovers on upgraded devices).

Rules enforced in `src/utils/dataRetention.ts` and `useAppStore` (`partialize` on every write,
`merge` on every read; the unfinished-journey marker is expired by `merge` and by the read selector, not by `partialize`, so an in-memory marker older than 2 h can still be written until the next read drops it): an unparseable, missing or future-dated timestamp, or an unusable
coordinate, fails closed (data dropped). A persisted blob from before this policy (no recent-search
stamps) is kept and its 30 day clock starts at first launch. Unknown keys and unknown schema
versions are whitelisted away. Clears are targeted: favorites, settings and the welcome flag
are never touched by the three Privacy actions, and `AsyncStorage.clear()` is deliberately
not used (it would erase host-owned keys and let in-memory state repopulate).

Evidence: SOURCE/RUNTIME (`src/__tests__/LocalDataRetention.test.ts`, `SettingsScreen.test.tsx`).
Device smoke test of the Clear actions: DEVICE REQUIRED. Play Data-Safety wording stays an owner task.
