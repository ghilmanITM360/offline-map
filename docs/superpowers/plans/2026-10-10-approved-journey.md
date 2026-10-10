# Approved Journey Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Deliver truthful destination-first planning and explicit manual/live activation.
**Architecture:** Keep one HomeScreen/Map. ViewModels own journey authority and async generation; shared capability validates native fixes. Directory forwards explicit destination/origin choices. Hypothetical origin is distinct from manual and GPS.
**Tech Stack:** Expo 54, React 19.1, React Native 0.81.5, Zustand 4, MapLibre 11.5, Jest/RNTL.
**Spec:** docs/superpowers/plans/2026-10-10-approved-journey-spec.md

## Global Constraints
- Canonical integration/ijtema-clean-baseline; base 57529e305332c761358da51d18b8be292e5b7a7e.
- Offline PMTiles/core routing; no dependencies, paid services, APK, signing or field claims.
- Directory sole chooser; preview before explicit activation; no assumed current location.
- Existing 50m/30000ms GPS policy, precise foreground permission, fail closed.
- English, Roman Urdu, Urdu RTL; retain FULL/PARTIAL/PEEK and camera semantics.
- Owner authorizes focused commits, pushes, PRs and green exact-head merges.

## Review Focus
- Permission revocation or clock rollback during preview/active session.
- Late location response following cancel/destination replacement.
- Block 2 preview mistaken for actual manual origin.
- Manual guide survives failed/cancelled live upgrade.
- Narrow screen/large fonts/RTL keeps actions discoverable.

### Task 1: GPS and authority safety (PR A series)
**Files:** LocationCapability.ts, LocationAccessService.ts, LocationNavigationCapability.ts, JourneyPresentationState.ts, DirectionsViewModel.ts, NavigationViewModelV2.ts, useAppStore.ts; corresponding tests.
**Interfaces:** classifyLiveFix(Coordinate|null, nowMs) remains shared quality authority; presentation consumes explicit capability; live command validates current store authority and route destination; ViewModel generation guards cancel stale acquisition.
- [ ] Write regressions rejecting NaN/negative/missing accuracy, malformed coordinates/timestamps and unknown precision; native adapter preserves missing quality; permanently denied never reprompts.
- [ ] Run focused Jest tests, expect new assertions FAIL.
- [x] Implement fail-closed quality/precision adapters. Keep existing thresholds.
- [ ] Implement remaining authority guards in follow-up PR A2.
- [ ] Add stale async/cancel, readiness, final-command regressions; watch FAIL then implement minimal changes.
- [ ] Run required checks, review diff, commit explicit paths, push/PR #307, inspect CI and exact-head merge.

### Task 2: Destination-first Map and explicit previews (PR B/C)
**Files:** LocationsDirectoryScreen.tsx, HomeScreen.tsx, LocationSheet.tsx, DirectionsViewModel.ts, LocationNavigationCapability.ts; Directory/Sheet/Directions tests.
**Interfaces:** pendingJourney is destination handoff only; directoryPurpose=start is explicit origin mode; normal selection never calls live start or permission.
- [ ] Write Directory deep-scroll/search/category destination handoff and cancel-origin regressions; run, expect FAIL.
- [ ] Implement every navigable destination Map handoff, visible needs-start panel, explicit origin chooser. Preserve details-only and safe Back.
- [ ] Write no-auto-start and preview-before-guide/live regressions; run, expect FAIL.
- [ ] Remove one-shot activation refs; validate route and origin; explicit CTAs. Location recovery never opens Settings automatically.
- [ ] Test guide upgrade failure preserves guide; successful upgrade previews new route before explicit live Start.
- [ ] Run required checks, review, commit/push/PR/green exact-head merge.

### Task 3: Hypothetical Block 2 (PR D)
**Files:** DirectionsViewModel.ts, LocationNavigationCapability.ts, JourneyPresentationState.ts, LocationSheet.tsx; tests.
**Interfaces:** hypothetical_place startSource distinct; canonical PublicDestinationsService resolves Block 2; explicit confirmation converts manual only.
- [ ] Write tests for no currentLocation mutation, no guide/live before confirmation, same-place, reset new journey; run, expect FAIL.
- [ ] Implement optional preview and persistent notice plus confirmation/change-start; preserve offline geometry.
- [ ] Run required checks, review, commit/push/PR/green exact-head merge.

### Task 4: Localization/accessibility and final acceptance (PR E)
**Files:** existing i18n messages/hooks, touched Directory/Map/guide/active controls, product docs, acceptance tests.
**Interfaces:** existing translator and layout direction; no geographic RTL mirroring.
- [ ] Write localized action/announcement and responsive interaction regressions; run, expect FAIL.
- [ ] Localize touched journey states; focus once on transition, dismiss keyboard, retain 48dp controls/PEEK/safe areas/reduced motion.
- [ ] Update product docs and UX-01..28 evidence matrix, distinguish automated/device/field.
- [ ] Run full required checks/routing regressions; independent review; commit/push/PR/green exact-head merge; final canonical/status/usage evidence.
