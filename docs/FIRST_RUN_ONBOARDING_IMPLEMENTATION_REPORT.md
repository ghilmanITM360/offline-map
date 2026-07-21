# First-Run Onboarding Redesign — Implementation Report

Date: 2026-07-20
Scope: Location + Offline Maps onboarding flow only. No navigation/routing logic touched.
Builds on: `docs/FIRST_RUN_ONBOARDING_AUDIT.md` (read-only audit from the prior session).

## Changed files

New:
- `src/views/screens/WelcomeScreen.tsx` — Screen 1 (intro/benefits)
- `src/viewmodels/WelcomeViewModel.ts` — persists "seen" flag, advances to Permission
- `src/services/OnboardingStatusService.ts` — `hasSeenWelcome()` / `setHasSeenWelcome()` (AsyncStorage, mirrors the existing direct-AsyncStorage pattern used for `graphOnlyMode` so Splash never depends on Zustand rehydration timing)

Edited:
- `src/navigation/RootNavigator.tsx` — registered `Welcome` route
- `src/views/screens/SplashScreen.tsx` — routes to `Welcome` first on a never-seen install; added a `skippedOnlineMode` branch so that choice is respected on relaunch
- `src/services/OfflineMapStatusService.ts` — added `OFFLINE_MAP_SKIPPED_KEY` + `setSkippedOnlineMode`/`isSkippedOnlineModeEnabled`; `markDownloaded()` now also clears the skipped flag
- `src/views/screens/PermissionScreen.tsx` — Screen 2 copy/buttons rewritten
- `src/viewmodels/PermissionViewModel.ts` — plain-language denied-but-askable alert; "Continue Without Location" now confirms consequences before proceeding (was silent)
- `src/views/screens/DownloadMapScreen.tsx` — Screen 3 copy/buttons rewritten, tile counts/zoom levels removed, cancel/skip confirmations added
- `src/viewmodels/DownloadMapViewModel.ts` — new `continueWithOnlineMode()` (persists the choice — this was the audited bug), storage pre-check, mid-download connectivity polling, plain-language failure messages
- `src/services/OfflineMapService.ts` — plain-language `userMessageForFailureType()`
- `scripts/test-offline-download.ts`, `scripts/test-offline-v2.ts` — updated literal-copy assertions to match new wording

## User flow (after this change)

| Step | Screen | Choice | Persisted? | Next launch |
|---|---|---|---|---|
| 1 | Welcome (new) | Continue | `hasSeenWelcome=true` | Never shown again |
| 2 | Permission | Allow Location | live OS state | Re-checked live (correct — OS is the source of truth) |
| 2 | Permission | Continue Without Location (confirms first) | not persisted | Permission re-shown only if OS permission still off |
| 3 | Download Map | Download Offline Map | `downloaded=true` | Straight to Main |
| 3 | Download Map | Use Venue Map Only (confirms first) | `graphOnlyMode=true` | Straight to Main |
| 3 | Download Map | Use Online Mode (confirms first) | `skippedOnlineMode=true` **(fixed)** | Straight to Main, not re-prompted |

`skippedOnlineMode` is the fix for the previously-audited bug: this choice used to do a bare `navigation.reset` with no persistence, so users were silently re-prompted to download on every relaunch. It's now symmetric with `graphOnlyMode`, and each setter clears the other + gets cleared on a successful download.

## Behavior added to Download Map screen

- **Storage pre-check**: `Paths.availableDiskSpace` (expo-file-system) checked against the estimated tile size + 20 MB margin before a fresh download starts; blocks with "Not enough storage. This map needs about X MB free." instead of starting and failing mid-way.
- **Cancel confirmation**: "Cancel download? Your progress will be lost…" before discarding.
- **Skip confirmations**: both Venue-Only and Online-Mode now show an explicit consequence dialog before navigating away (previously "Use Venue Map Only" already explained itself post-hoc via a hint; "Use Online Mode" explained nothing).
- **Faster network-loss detection**: connectivity snapshot checked every 5 tiles during the download loop; a drop now surfaces within a few tiles instead of only after a tile exhausts its ~27s timeout/retry chain.
- **Jargon removed**: "Zoom levels 14-18", raw tile counts, "Connecting to tile server…", "DNS failed", "Manifest verification failed" style phrasing all replaced with plain sentences. `AppGuideScreen.tsx`'s "connector verification" wording was deliberately **left unchanged** — it's the app's actual established term for a real gate state (used verbatim in `V2NavigationAdapter`/`V2PlaceAdapter` user-facing messages elsewhere), not an internal-implementation leak like DNS/manifest were.

## Test results

- `npx tsc --noEmit`: clean
- `npm run lint`: clean
- `npx jest`: 5 suites / 34 tests passed, no regressions
- `npm test` (full `scripts/test-*.ts` chain, ~85 scripts): all passed after updating the two scripts whose assertions checked old literal copy strings

## Fresh-install paths traced by code reading (no physical device available this session)

1. Allow location + Download map → Welcome→Permission(Allow)→DownloadMap(Download)→complete→Main. No jargon shown.
2. Allow location + Use Online Mode → same to DownloadMap, then confirm→Main; relaunch goes straight to Main (bug fixed).
3. Deny location → stays on Permission with either an "Open Settings" recovery (permanent deny) or a plain retry-or-continue message (soft deny); "Continue Without Location" always available.
4. Continue Without Location → confirmation dialog required before proceeding; permission screen reappears on relaunch only because OS permission is still genuinely off (correct, not a bug).
5. Download fails → plain-language error + Try Again / Use Venue Map Only / Use Online Mode all remain reachable, no dead end.
6. Network removed mid-download → detected within ~5 tiles, surfaces "Internet connection was lost…", Try Again resumes from the last saved tile.
7. Low storage → pre-flight check blocks the download before any writes with a clear message; a genuine mid-download disk-full write failure still surfaces its own plain message.
8. Reopen after every choice → Welcome/Downloaded/Venue-Only/Online-Mode never re-prompt; Permission re-prompts only while OS permission is actually off.

## Remaining issues

- Not verified on a physical device/emulator this session — verification above is by tracing the code paths, not by driving the UI. Recommend a manual pass through all 8 cases before shipping.
- Phase 3 polish (animations, richer illustrations, deeper accessibility audit) was intentionally not done — out of scope for this pass, which prioritized the Phase 1/2 items from the request.
- `estimatedSizeMb` is a rough heuristic (`tiles × 0.08 MB`), same approximation the app already used before this change — good enough for a "roughly X MB" message but not exact.
