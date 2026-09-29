# Project Status

Current snapshot only. This file is replaced on each update, not appended to — history lives in git and the issue tracker, not here.

**Last updated:** 2026-09-29
**Canonical branch:** `integration/ijtema-clean-baseline`
**Snapshot basis:** canonical `1599c324b7b5cfc1a0a92b4b1158382d4a7a2b81` (PR #114). Pull requests not yet integrated at that point are not reflected here; this file is refreshed after integration.
**Current milestone:** **Android APK Acceptance** — a fully tested, stable Android APK. Store/Play publishing, production signing, and legal/store submission are explicitly out of this milestone (tracked separately, see "Future Deployment" below).

Full ticket-by-requirement coverage: [`docs/audit/MASTER_TICKET_MATRIX.md`](audit/MASTER_TICKET_MATRIX.md).

## Readiness

| | Status |
|---|---|
| Current-milestone (APK) readiness | Not yet — see #135 (Final Android APK Acceptance) checklist; blocked on #46, #93, #95, #124, #126 (UI/UX audit), #129 (performance profiling) |
| Future-deployment readiness | Not started, correctly out of scope — owner actions #47/#48/#49, plus #137 (iOS key) |

## Test baseline (SOURCE/RUNTIME VERIFIED on bare `1599c32`, 2026-09-29)

- `npm run typecheck` — clean
- `npm run lint` — clean
- `npm run test:components` (Jest) — **55 suites / 597 tests, all passing**
- `npm test` (102-step script chain) — passes
- `git diff --check` — clean

Not yet run this cycle: Android release build sanity check, physical-device and field verification (see blockers below).

## Open issues by priority (P1)

- #46 — Physical Ijtima walking acceptance test (needs field)
- #48 — Production signing / Play App Signing (owner action, Future Deployment)
- #49 — Google Maps production restrictions verification (owner action, Future Deployment; also has a live-risk component — historical exposed key)
- #93 — Nearest-node snapping continuity/hysteresis (root cause confirmed, fix deferred pending #46 field data)
- #115 — NEW-06 connector-cost ambiguity + NEW-02/03 diff-level classification
- #118 — DATA-VALIDATION-002 (implemented in PR #121; see the issue for merge state)
- #124 — Outside routing wrongly falls back to "Direct guide" despite a valid OSM route (reproducible, root-cause narrowed)
- #135 — Final Android APK Acceptance (current-milestone gate, not the historical #57)

**P2/P3 and full breakdown:** see `docs/audit/MASTER_TICKET_MATRIX.md`.

**Tracker:** #63 — Production Readiness audit tracker, now with native GitHub sub-issue structure (#122 Offline-First, #126 UI/UX, #129 Performance, #133 Admin Data Workflow, #134 Future SDK, #135 Final APK Acceptance).

## Recently closed

- #96 — Non-routable destinations now show a muted, distinguishable tap affordance (PR #98)
- #103, #105, #107, #109, #111, #113 — routing/navigation correctness fixes (all merged, see git log)
- #45 — LOC-01..12 runtime verification: 7/12 emulator-tier PASS, remainder (weak fix, GPS loss/recovery, background/resume) correctly deferred to #46's physical-device tier — not a regression, see reconciliation comment on #45
- #58, #81, #80, #62, #56, #53, #52, #51, #54, #50, #25 — prior-cycle cleanup/security/docs work (unchanged from last snapshot)

## Owner blockers (cannot be closed by an agent)

#47, #48, #49 (Future Deployment), #133 (Admin Data Workflow questionnaire — never walked with the owner until filed this cycle), #136 (crowd-flow/walkability — not currently planned).

## Field blockers (need the physical venue)

#43, #44 (gate survey), #46 (walking acceptance test), #116 (Mimbar survey — zero prior data, do not fabricate).

## Physical-device blockers (need real hardware, not emulator)

#46 (remainder of LOC-01..12: weak fix, GPS loss/recovery, background/resume), #128 (TalkBack screen-reader flow), #131 (battery/thermal specifically).

## In progress / next

Ticket-reconciliation and backlog-structuring pass complete (this cycle) — see `docs/audit/MASTER_TICKET_MATRIX.md`. Recommended next engineering ticket: #115 (NEW-06 connector-cost ambiguity) — not started this cycle, per explicit instruction to finish ticket coverage before resuming implementation.
