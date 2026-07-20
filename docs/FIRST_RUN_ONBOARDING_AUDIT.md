# First-Run Onboarding Audit (Location + Offline Maps)

Date: 2026-07-20
Scope: `SplashScreen.tsx` routing → `PermissionScreen.tsx`/`PermissionViewModel.ts` → `DownloadMapScreen.tsx`/`DownloadMapViewModel.ts`. No code changed — audit only.

## Flow entry point

`SplashScreen.tsx:32-108` (`checkStatus()`) runs on every launch — there is no "hasSeenOnboarding" flag. It checks, in parallel: OS location permission (live, not persisted — `hasLocationPermission` is explicitly excluded from Zustand `partialize` in `useAppStore.ts:342-360`), offline map status, connectivity, and the persisted `graphOnlyMode` flag.

Routing order (`SplashScreen.tsx:72-99`), first match wins:
1. No location permission → `Permission`
2. Map already downloaded → `Main`
3. Map corrupt/needs update → `DownloadMap`
4. `graphOnlyMode` on + no map → `Main`
5. No internet + no map → `Main` (forced graph-only)
6. Else (internet, no map yet) → `DownloadMap`

`AppGuideScreen.tsx` is a separate in-app help screen, not part of first-run routing.

## Permission screen

- **Grant Permission** → `PermissionViewModel.requestPermission` (`PermissionViewModel.ts:35-58`):
  - Granted → `navigateNext()` → `DownloadMap` or `Main`.
  - Denied (can ask again) → `Alert.alert('Location permission is required for navigation.')` — bare single-string alert, default OK button, no retry guidance (`PermissionViewModel.ts:50`).
  - Denied permanently (`canAskAgain === false`) → alert with **Open Settings** button wired to `Linking.openSettings()` (`PermissionViewModel.ts:44-48`) — real recovery path, confirmed present.
- **Maybe Later** → `skipPermission` (`PermissionViewModel.ts:60-62`) calls `navigateNext()` directly, no confirmation/explanation of what's lost. Since permission state isn't persisted, user is re-prompted every relaunch until granted or permanently denied.
- No back button on this screen (expected — it's the entry screen).

## Offline map screen

- **Download Now** (`DownloadMapViewModel.ts:178-377`): upfront connectivity check → staged network diagnostics (DNS/tile-server/first-tile probes, specific failure messages) → per-tile download loop with real progress (`downloadedTiles`/`totalTiles`, percentage bar, `DownloadMapScreen.tsx:122-134`), 2 retries + 9s timeout per tile.
  - **Network loss mid-download**: no active listener; only detected when the in-flight tile's fetch times out (up to ~9s × up to 3 attempts) — UI shows "Downloading…" with no indication network dropped for that window, then surfaces a retry-capable error.
  - **Storage full**: no proactive free-space check anywhere in `src/` (confirmed via grep). Only caught if the native write error's message heuristically matches "file" → "Map tile write failed. Please free storage and retry." (`OfflineMapService.ts:541-543`); otherwise falls through to a generic "check your internet connection" message that misdirects the user.
  - **Pause/Resume**: real — `pausedRef` busy-wait pause; resume (even after app restart) re-checks per-tile existence and only downloads what's missing.
  - **Cancel**: no confirmation dialog before discarding progress (`DownloadMapScreen.tsx:182-185`).
  - **Repair Download** (shown when corrupt/needs-update): wipes and re-downloads from scratch.
  - **On completion**: auto-navigates to `Main` after 1200ms; a 2600ms fallback reveals a manual "Continue to Map" button if auto-nav silently fails — good stuck-state safeguard.
- **Use venue map only** → `continueWithVenueMapOnly` (`DownloadMapViewModel.ts:429-438`): persists `graphOnlyMode=true` (AsyncStorage), shows "Background map unavailable. Ijtema routes still work.", goes to `Main`. Persisted choice — Splash skips `DownloadMap` on future launches. `HomeScreen.tsx:1173-1179` shows a permanent banner with a "Download background map" re-entry button — not a dead end.
- **Skip - Use online mode** (only shown when idle/error state **and** internet present): does `navigation.reset` straight to `Main` with **no ViewModel call at all** — does not persist anything. **Inconsistency**: unlike venue-only, this choice does not survive relaunch — user with internet on will be routed back to `DownloadMap` again next launch, even though they already chose to skip once.

## Stuck-state / risk summary

1. Denied-but-askable alert gives no next-step guidance beyond a bare OK.
2. "Skip - Use online mode" not persisted → repeated re-prompt loop, confusing over multiple launches.
3. No real storage-full detection → misleading "check your internet" message on a full-disk failure.
4. Network-loss mid-download has a silent-looking stall window (up to ~27s) before any visible error.
5. Cancel has no "Are you sure?" confirmation.

## Technical/jargon copy found (verbatim)

- `PermissionViewModel.ts:50` — "Location permission is required for navigation." (bare alert)
- `DownloadMapViewModel.ts:27` / `OfflineMapService.ts:328` — "DNS failed. Try another network or mobile data."
- `DownloadMapViewModel.ts:30` — "Map server rejected download."
- `OfflineMapService.ts:339` — "Map tile write failed. Please free storage and retry."
- `OfflineMapService.ts:341` — "Map data save failed. Please retry download."
- `DownloadMapViewModel.ts:135/166` — "Manifest verification failed..."
- `DownloadMapScreen.tsx:117-118` — "Zoom levels 14-18 for walking navigation. Expected tiles: N"
- `DownloadMapScreen.tsx:139` — "Connecting to tile server…"
- `AppGuideScreen.tsx:130` — "...connector verification..."

None of these are elderly/non-technical-friendly; all expose internal implementation concepts (DNS, manifest, tile server, connector verification) directly in user-facing copy.

## Recommended fixes (not yet implemented)

1. Rewrite all user-facing error/status copy above in plain language, hiding cause; keep technical detail only in a collapsible "details" affordance or logs.
2. Persist the "Skip - Use online mode" choice the same way "venue map only" is persisted (e.g. `graphOnlyMode`-equivalent or a distinct `skippedDownloadOnce` flag with a re-offer on a longer cadence, not every launch), OR make the re-prompt intentional and say so explicitly ("We'll ask again next time you're online" ) so it doesn't feel like a bug.
3. Add a proactive storage-space check before starting download (e.g. `expo-file-system` free-space API) and a dedicated "Not enough storage" message with the required size shown.
4. Add a lightweight connectivity listener during download so network loss surfaces within 1-2s instead of waiting on a tile timeout.
5. Add a confirmation step before Cancel discards progress.
6. Improve the denied-but-askable alert with actual guidance ("You can allow location from the button below, or continue without it") instead of a bare single-line alert.
7. Consider replacing raw tile-count/zoom-level display with a plain "Downloading offline map… (~48 MB)" style copy for non-technical users.
