# Technical Findings

## CTF-001 — Fresh emulator GPS delivery is blocked before application observation

- Affected: Recenter, fresh-current-location route origin, active navigation, reroute and arrival.
- Source: `LocationAccessService.ts:121-167`; `GPSManagerService.ts:102-153`; `HomeViewModel.ts:199-301`.
- Reproduction: on the trusted APK, tap recenter; send bounded official emulator `geo fix` commands during the 15-second request; inspect `dumpsys location`; wait for UI result.
- Runtime evidence: emulator console returned `OK`; Android GPS/fused last location did not change; no new app-attributed provider request appeared; app timed out and displayed Location unavailable.
- Root cause: not established. Failure boundary is before Expo/app observation. Play-services/emulator configuration remains a hypothesis.
- User-visible effect: current location cannot be acquired in this test environment; normal navigation-dependent flows cannot be verified.
- Coverage gap: Expo Location is mocked in automated tests; no native emulator integration test.
- Remaining verification: repair/replace emulator location stack, prove Android provider delivery, then repeat with unmodified APK.

## CTF-002 — Google base map rejects the audit APK credential context

- Affected: Home map base layer.
- Source/config: `app.json` Android package/API-key configuration; Home graph-only warning at `HomeScreen.tsx:879,1602-1623`.
- Runtime evidence: blank beige Google surface with offline venue data and explicit key warning; Maps SDK logged `INVALID_ARGUMENT` with the audit debug certificate/package identity.
- Root cause: credential restriction/configuration mismatch for this debug-signed release-shaped artifact is strongly evidenced; production credential state was not inspected.
- User-visible effect: offline venue graph remains available, but contextual road/satellite base map is absent.
- Remaining verification: test a correctly restricted non-secret client rendering key on an authorized build; do not conflate with Routes credentials.

## CTF-003 — Several top-level screens have no rendered component tests

- Affected: Welcome, Permission screen, Download Map, Settings, Help, About, App Guide and CustomDrawer.
- Evidence: independent test inventory found no direct render tests for these surfaces.
- User-visible effect: regressions in layout, labels, links, focus and state presentation may escape Jest.
- Remaining verification: Claude should reconcile against existing backlog; no issue was filed by this audit.

## CTF-004 — Android accessibility behavior remains materially under-verified

- Affected: dynamic navigation status, GPS_LOST, focus order, scaled text, touch targets.
- Evidence: source props and two UIAutomator trees exist; no TalkBack speech capture.
- Root cause: coverage/environment gap, not a confirmed product defect.
- Remaining verification: direct TalkBack session on a healthy navigation run, preserving app process during GPS cutoff.

## CTF-005 — Confirmed Cancel Route leaves stale local route-ready UI

- Affected: `LocationSheet` route preview / Directions.
- Source: `HomeScreen.tsx:1166-1171,1817-1824`; `useAppStore.ts:403-411`; `DirectionsViewModel.ts:68-85`.
- Reproduction: choose Block 13; Directions; manual start; search/select Gate 13; after the route is ready, tap Cancel Route and confirm destructive Cancel route.
- Runtime evidence: confirmation dialog rendered; after confirmation the 852 m Route Ready card and disabled Start Navigation remained visible, while the Cancel Route action disappeared.
- Root-cause evidence: confirmation calls only `clearRoutePlanner()`, clearing the global route/destination. The still-mounted `RoutePreviewSection` retains its hook-local `route` and `loadState`; `onCancelRoute` becomes undefined because `activePreviewRoute` is now null. This explains the exact observed stale card/action disappearance.
- User-visible effect: cancellation contradicts “You will need to choose your destination again” and leaves an apparently valid route without a cancel affordance.
- Test gap: `HomeScreen.test.tsx` asserts store clearing but no integrated assertion covers the still-mounted LocationSheet after confirmation.
- Remaining verification: reconcile with backlog; no issue created here.

## CTF-006 — Home LocationSheet portal leaks over Offline Maps screen

- Affected: Home LocationSheet, drawer Offline Maps / DownloadMap screen.
- Source: `CustomDrawer.tsx:27-68`; global `BottomSheetModalProvider` in `App.tsx:11-25`; Home modal at `HomeScreen.tsx:1765-1863`.
- Reproduction: leave Block 13 LocationSheet open on Home; open drawer; choose Offline Maps.
- Runtime evidence: Offline Maps screen rendered, but Block 13 LocationSheet remained over it and intercepted the lower screen.
- Root-cause evidence: Offline Maps closes the drawer and navigates the parent stack without dismissing/resetting Home’s portal-rendered modal. Home remains mounted behind the pushed stack screen while the global modal portal stays visible.
- User-visible effect: unrelated screen is obscured by stale destination actions/content.
- Test gap: no rendered CustomDrawer test or cross-stack navigation test with an open sheet.
- Remaining verification: reproduce after a cold reset and reconcile with existing issues; no issue created here.

## Owner-content blocker — legal links are intentionally unconfigured

`AboutScreen.tsx:12-20` contains explicit TODO constants for Privacy Policy and Terms. The current APK displays a safe “Link unavailable” alert. This is not treated as fabricated legal content or an implementation defect; owner-provided URLs are required.

## Not elevated to confirmed findings

- Historical secondary-instruction truncation: not reproduced on this trusted build because active navigation was blocked.
- Google Location Accuracy consent: plausible historical/environment hypothesis only.
- Reroute/arrival defects: none claimed; only runtime verification is blocked.
