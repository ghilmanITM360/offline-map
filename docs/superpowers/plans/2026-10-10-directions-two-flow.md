# Directions continuity and two-flow implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans task-by-task. Inline execution; independent source review before integration.

**Goal:** Keep directions accessible and deliver the owner-approved fresh-location fast path without weakening journey authority.
**Architecture:** One HomeScreen and Map. Home owns presentation, DirectionsViewModel owns intent and routing generations, store owns final activation. Active instructions consume the existing navigation engine.
**Tech Stack:** React Native 0.81.5, React 19.1, Expo 54, Gorhom Bottom Sheet 5.2.8, MapLibre 11.5, Jest/RNTL14.
**Spec:** `docs/superpowers/plans/2026-10-10-directions-two-flow-spec.md` (owner attachment a3f29a00-86df-495b-8469-17d7a73b7d57); supersedes universal explicit Start in the earlier approved journey plan.

## Global constraints
- Base canonical bce222b208dea446b81cdcf45c65d8182b096bcf; issue #307.
- No dependency changes, APK, fabricated GIS or native verification claims.
- Retain precise permission, enabled services, 50m accuracy and 30000ms freshness guards.
- Exactly one automatic activation attempt per eligible explicit destination intent. Manual upgrades remain confirmed preview followed by explicit live Start.
- Offline route/provider order unchanged. Block 2 is hypothetical until explicitly confirmed.
- Owner authorizes commits, pushes, PRs and exact-head green merges.

## Review focus
- Unexpected native dismiss or Map tap must not cancel planning or guide state.
- Rejected live activation must retain setup; successful activation must not leave a blank transition.
- Late route/location/chooser answers must not activate a newer or cancelled journey.
- Failed/cancelled manual upgrade must retain original route and selected step.
- Large fonts, RTL, reduced motion and system insets must keep reopen controls usable.

### Task 1: Directions presentation repair
**Files:** HomeScreen.tsx, LocationSheet.tsx, NavigationChromeV2.tsx, corresponding tests, existing localization messages.
**Interfaces:** Setup close remains explicit cancellation/back ownership; Map tap and expanded Back collapse to index0. Unexpected native hidden/dismiss callbacks re-present current route identity at PEEK. NavigationChromeV2 renders a localized Directions control and scrollable full instruction panel using overlay.instructions; closing it never changes journey state.
- [x] Write regressions for Map tap, unexpected hidden/dismiss, expanded Back, rejected Start, and active Directions reopening during GPS loss/reroute.
- [x] Run focused regressions and observe failures.
- [x] Implement presentation-only repair; sheet movement changes padding only, not semantic camera target.
- [x] Ensure live controls are visible immediately when setup leaves.
- [x] Run focused and required full checks and independent review.
- [ ] Commit/push/PR/green guarded merge.

### Task 2: Fresh-GPS destination fast path
**Files:** pendingJourney store contract, Directory, Home, DirectionsViewModel, capability/authority integration tests.
**Interfaces:** Unique runtime intent identity and eligibility snapshot travel with destination handoff; ViewModel consumes once, validates current route/facts, final guarded start remains authoritative.
- [ ] Write fresh Block/Gate/Rasta success and stale/approximate/direct-guide/same-place refusal tests.
- [ ] Write rapid A/B, cancel, revoked permission, rerender/hydration and manual-mode race tests.
- [ ] Implement one owned attempt after route validation; keep failure/recovery panel visible.
- [ ] Validate/review/integrate without automatic process-death resume or active-trip replacement.

### Task 3: Journey continuity and contextual recovery
**Files:** DirectionsViewModel, LocationSheet, Directory/store contracts, LocationAccessService, targeted tests.
**Interfaces:** ViewModel-owned manual upgrade transaction captures route, origin, guide and step; speculative live candidate remains separate until validated. Chooser request/answer includes journey identity. Runtime browse snapshot restores query/category/scroll.
- [ ] Write confirmation-before-request and cancellation/failure restoration regressions.
- [ ] Implement private acquisition/replacement preview and explicit live Start; retire transaction on legitimate journey replacement.
- [ ] Add explicit permission/service Settings actions and foreground fact refresh without automatic prompts/start.
- [ ] Guard stale chooser answers and restore browsing on cancel; validate/review/integrate.

### Task 4: Hypothetical Block 2 and acceptance
**Files:** start-source contracts, DirectionsViewModel, LocationSheet, existing translations, product docs/tests.
**Interfaces:** hypothetical_place is not manual_place/live_gps; canonical Block2 resolver only. Explicit I'm at Block2 converts to manual origin.
- [ ] Write no-position-mutation/no-guide-before-confirmation/same-place/reset regressions; implement optional labelled shortcut.
- [ ] Complete en/ur-Latn/ur copy, RTL and accessible focus/control tests for touched surfaces.
- [ ] Update UX-01–28 for two-flow policy and mandatory state/concurrency matrix; distinguish automated and native evidence.
- [ ] Run final full validation/review/integration and report exact canonical/status/remaining runtime work.

## Runtime boundary
ADB available, no connected device/emulator during preflight. No APK/build authorized. Native swipe, predictive Back, TalkBack audio, 320dp/200% fonts, navigation bars, Settings and controlled provider behavior remain EMULATOR UNVERIFIED until an appropriate existing runtime is available.
