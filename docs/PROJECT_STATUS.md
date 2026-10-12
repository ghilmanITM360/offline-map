# Project Status

**Updated:** 2026-10-12. Canonical: `integration/ijtema-clean-baseline`.
Validated application source: `d7cafed977e1b0660b5efc915bd8dc66ca2cd618` ([PR #375](https://github.com/ghilmanITM360/offline-map/pull/375)).
Permanent root: `/Users/ghilmanislam360/GhilmanProjects/offline-map`.
Earlier checkpoints remain in Git history and [historical status](history/2026-10-06-project-status.md).

**PHASE A — INTERNAL SDK EXTRACTION READY.** The owner-defined internal software/consolidation gate is satisfied: one registered checkout, current canonical application source, reconciled required changes, verified recovery evidence and passing automated checks. This is not public-release, native or field certification. The broader [readiness tracker #63](https://github.com/ghilmanITM360/offline-map/issues/63) and native/field/security issues remain open.

## Reconciled source

PRs #357–374 retain destination-first Map setup, guarded fresh-GPS activation, GPS-free Manual Route Guide, upgrade rollback, permission recovery, Directions PEEK/reopening, stale-journey protection, hypothetical Block 2 and three-language journey guidance/accessibility focus. No navigation engine was replaced.

PR #375 ports the useful two-line Button draft: labels can shrink/wrap between icons and multiline text is centered. Three locale regression cases failed before the fix and passed afterward. Independent review and [exact-head CI](https://github.com/ghilmanITM360/offline-map/actions/runs/38221923967) passed. This source contract does not establish native large-font rendering.

## Executed checks on the single checkout

All commands below exited 0 against `d7cafed977e1b0660b5efc915bd8dc66ca2cd618`:

- `npm run typecheck`: PASS (app and scripts).
- `npm run lint`: PASS; 0 errors / 1 existing unused-disable warning in generated `markerImages.generated.ts`. The 13 nested-checkout warnings disappeared after removal; lint configuration was not changed.
- `npm test`: PASS; 106 command headings (parent and 105 child scripts).
- `npm run test:components -- --runInBand`: 165 suites / 1,602 tests PASS, 63.896 seconds.
- `git diff --check`: PASS.
- `npm run test:all-gates-v2`: 16 PASS / 2 field BLOCKED / 0 FAIL.
- `npm run test:outside-street-gate-selection-cost-v2`: PASS.
- `npm run test:core-provider-routing-contract-v2`: PASS.
- `npm run test:reroute-v2`: PASS.
- `node --import tsx scripts/hardcoded-strings.ts`: 82 findings in 15 files; [classification inventory](LOCALIZATION_SCANNER_CLASSIFICATION.json) retained.

Evidence level: **SOURCE/RUNTIME VERIFIED** only. Existing React act, Node-only hydration/window and provider fixture distance sanity warnings remain visible, not suppressed. Logs are in `/Users/ghilmanislam360/.codex/recovery/ijtema-final-consolidation-20261012T080451Z/single-checkout-validation/` outside active source.

## Repository consolidation

The final campaign normally removed all 12 linked checkouts: 13 → 5 → 3 → 1 registrations. No new worktree/clone, force removal, destructive reset, manual administrative deletion or remote-branch deletion occurred. Historical branches, detached HEADs, patches, untracked drafts and private configuration remain preserved. [Detailed disposition](WORKSPACE_CONSOLIDATION.md) records recovery and retention boundaries.

The sole untracked file is `.codex/environments/environment.toml`: known machine-specific config retained in place with a verified recovery copy, not committed. Tracked files are clean. No nested repositories or broken active dependency symlinks remain. Stale ignored CocoaPods output was quarantined intact; dependencies must be regenerated for a future supported iOS build.

## Pending acceptance and security

- [UX evidence](UX_ACCEPTANCE_EVIDENCE.md): 24 automated PASS / 4 NOT VERIFIED. UX-21/25/26/27 still require adequate native interaction, airplane mode, 320dp/200% font and whole-journey language evidence; the Button test does not close them.
- Android SDK and three AVDs are installed; no emulator/device acceptance was executed in this cleanup campaign. Prior disk limits are historical, not a current verified blocker. Native Settings/GPS, Urdu rendering, audible TalkBack/VoiceOver, offline visual rendering and iOS compatibility remain unverified.
- Dependency audit: 66 findings (13 moderate / 52 high / 1 critical) on the unchanged lockfile. [Security triage/deferrals](DEPENDENCY_SECURITY_STATUS.md) remain applicable; [#370](https://github.com/ghilmanITM360/offline-map/issues/370) stays open. No remediation, zero-vulnerability assertion or release exception is claimed.
- Gates 18/19 (#43/#44), real walking/arrival (#46), Mimbar ground truth (#116) remain field-required. Proxy deployment (#123) and real-provider acceptance (#161) remain external/native gates; core offline routing does not require them.

No release APK, publication or deployment was performed. The next SDK phase may use an ordinary branch in this same folder. Its first deliverable is an architecture RFC for one shared offline-navigation implementation, Karachi Ijtema and Muslim Ummah iOS/Android apps, and secure versioned venue packs. No extraction or large code migration is included in this checkpoint.
