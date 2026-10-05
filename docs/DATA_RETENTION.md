# On-device data retention (#145)

Engineering policy using the defaults the project owner authorised on 2026-10-05. It describes
what the app *does*; it is not the legal privacy policy (owner-provided, see
`RELEASE_SECURITY_PRIVACY.md`). There is no server-side user data. Everything is app-internal
storage (AsyncStorage / app document directory); nothing sensitive goes to shared storage.
Android backup exclusions are already in place.

| Data | Where | Class | Retention | Clear |
|---|---|---|---|---|
| Movement history / GPS trail / route samples | never persisted | - | none | n/a |
| Active route, progress, snapped/current position | memory only | transient | process lifetime | n/a |
| Last known location (one fix, `lastKnownLocation*`) | `ijtema-app-store` | sensitive | **24 h**, then dropped on write and on read | Settings > Privacy > Clear Saved Location |
| Recent searches (<=10, `recentSearches`, `recentSearchTimes`) | `ijtema-app-store` | search history | **30 days per entry** | Settings > Privacy > Clear Recent Searches |
| Unfinished-journey marker (destination id + time, no coordinates) | `ijtema-app-store` | recovery marker | **2 h** | Settings > Privacy > Clear Navigation Recovery |
| Favorites, settings, map-layer toggles, tutorial flags | `ijtema-app-store` | user preference | until user changes/uninstall | not wiped by any clear |
| Onboarding flags (`ijtema.onboarding.*`) | AsyncStorage | preference | until uninstall | not wiped |
| Offline map status/manifest (`ijtema.offline_map.*`), downloaded tiles (`tiles/`) | AsyncStorage + document dir | offline asset / cache | until replaced or user deletes | Settings > Delete Map Data (existing) |

Rules enforced in `src/utils/dataRetention.ts` and `useAppStore` (`partialize` on every write,
`merge` on every read): an unparseable, missing or future-dated timestamp, or an unusable
coordinate, fails closed (data dropped). A persisted blob from before this policy (no recent-search
stamps) is kept and its 30 day clock starts at first launch. Unknown keys and unknown schema
versions are whitelisted away. Clears are targeted: favorites, settings, setup flags and offline
data are never touched by the three Privacy actions, and `AsyncStorage.clear()` is deliberately
not used (it would erase host-owned keys and let in-memory state repopulate).

Evidence: SOURCE/RUNTIME (`src/__tests__/LocalDataRetention.test.ts`, `SettingsScreen.test.tsx`).
Device smoke test of the Clear actions: DEVICE REQUIRED. Play Data-Safety wording stays an owner task.
