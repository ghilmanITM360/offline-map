# Project Status

Current snapshot only. This file is replaced on each update, not appended to — history lives in git and the issue tracker, not here.

**Last updated:** 2026-09-22
**Canonical branch:** `integration/ijtema-clean-baseline`
**Current HEAD:** `1c0d1a2` (docs consolidation, #53) — this cycle's asset cleanup (#52) will advance it further once merged

## Readiness

| | Status |
|---|---|
| Field-test readiness | Not yet — blocked on #57 (final field-test APK) and outstanding field/runtime issues below |
| Store-release readiness | Not yet — blocked on owner actions (#47, #48, #49) and field verification (#45, #46) |

## Test baseline (SOURCE/RUNTIME VERIFIED, this HEAD)

- `npm run typecheck` — clean
- `npm run lint` — clean
- `npx jest` — 51 suites / 550 tests passed
- High-value script suite — all passed
- `git diff --check` — clean

Not yet run this cycle: Android release build sanity check, physical-device and field verification (see blockers below).

## Open issues by priority

**P1 (owner/field-blocked, cannot be closed from this environment):**
- #45 — LOC-01..12 Android location-capability runtime verification (needs physical device)
- #46 — Physical Ijtima walking acceptance test (needs field)
- #48 — Production signing / Play App Signing (owner action)
- #49 — Google Maps production restrictions verification (owner action)

**P2:**
- #43, #44 — Gate 18/19 graph connectors (blocked on field survey, owner-required)
- #47 — Privacy / Terms / Support links (owner action)
- #55 — Performance/reliability review (not started this cycle)
- #57 — Final field-test APK + evidence pack (last phase, depends on everything else)

**P3 (repository hygiene):**
- #52 — Asset/image cleanup (docs/qa-evidence deletion PR open this cycle)

**Tracker:**
- #63 — Production Readiness audit tracker (keep current as issues close)

## Recently closed this cycle

- #58 — Android backup policy (PR #85, merged, device-verified)
- #81 — Storage permissions removal (PR #84, merged)
- #80 — R8 minify/resource shrinking (PR #83, merged)
- #62 — Dependency security triage (independently re-verified: 18 advisories, all build-tool-only/non-shipped, accepted as documented release exception, review date 2026-12-31)
- #56 — AGENTS.md/CLAUDE.md standardization (PR #86, merged)
- #53 — Markdown consolidation, 54 → 11 live docs (PR #87, merged)
- #51 — Stash/worktree reconciliation (neither artifact present in this repo environment)
- #54 — Security review reconciliation
- #50, #25 — Stale PR/repo-cleanup reconciliation

## Repository hygiene

- Branches: 26 → 2 (`integration/ijtema-clean-baseline`, `main`) — 17 remote + 4 orphaned-local branches deleted, all confirmed merged/superseded/closed with zero unique portable work.
- Worktrees: 3 stale local checkouts removed (clean, no unique work); 3 stub prune entries cleared.
- Stashes: none exist.
- Docs: 54 live Markdown files → 11 canonical docs (README, AGENTS, CLAUDE, PROJECT_STATUS, and 7 topic docs under `docs/`), ~80% reduction.

## Owner blockers (cannot be closed by an agent)

#47 (legal/support links), #48 (production signing), #49 (Maps production restrictions) — need real owner-provided facts, not agent-generated content.

## Field blockers (need the physical venue)

#43, #44 (gate survey), #46 (walking acceptance test).

## Physical-device blockers (need real hardware, not emulator)

#45 (LOC-01..12 runtime verification).

## In progress

#52 — deleting the 12 stale `docs/qa-evidence/*.png` screenshots (8.1MB, unblocked now that #53 retired the 2 docs referencing them); everything else in that inventory (native icons/splash/markers) stays, it's runtime/config-referenced.

## Next

Merge #52's asset-cleanup PR → #55 performance review → final validation pass → #57 field-test APK build.
