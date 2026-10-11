# Project Status

Current snapshot. Historical evidence is preserved in [the prior status](history/2026-10-06-project-status.md) and Git history; it does not certify this candidate.

**Updated:** 2026-10-11. **Canonical:** `integration/ijtema-clean-baseline`. **Verified source:** `c833814dec839f1cca249c25f760c232cd351b3d`, integrated as `b36e1e4ba7eebacf89f6db4bccb237014da95ce3` through #369, with identical trees.

**Current milestone: Phase A software stabilization — INCOMPLETE.** SDK extraction and Muslim Ummah development remain gated until software fixes, validation, relevant-branch reconciliation and safe single-checkout consolidation finish. Production/native/field acceptance has not been established.

## Integrated continuation work

PRs #357–366 preserve GPS quality, journey identity, activation/cancellation, destination-first Map setup, Directions PEEK/reopen, fresh-GPS automatic activation, explicit manual upgrades, permission recovery, generation-bound Directory choices/browsing restoration and hypothetical Block 2. This campaign additionally integrated:

- #367: Directory three-language labels, spoken actions, RTL, localized names and Roman Urdu search aliases.
- #368: manual Route Guide controls/counts and Directions Back labels/direction.
- #369: recovered #355 app-shell localization, preserving newer permission safeguards and correcting Help policy. #355 is closed as superseded; original branch/commits remain preserved.

Whole navigation preview/error/instruction/arrival localization and remaining focus/accessibility work are unfinished. Existing catalogs remain the only translation system. Scanner counts are a ratchet, not proof of complete localization.

## Executed source checks

Against the verified source above:

- `npm run typecheck`: PASS.
- `npm run lint`: PASS, 0 errors / 1 existing generated markerImages warning.
- `npm test`: PASS, 106 command headings.
- `npm run test:components -- --runInBand`: PASS, 157 suites / 1,556 tests, 55.704 s.
- `git diff --check`: PASS.
- Four required routing commands: PASS separately; `test:all-gates-v2` reports 16 PASS / 2 field BLOCKED / 0 FAIL. Existing provider fixture warning: 789.1 m sanity cap. Existing act and Node-only hydration warnings remain.
- [Exact-head CI](https://github.com/ghilmanITM360/offline-map/actions/runs/38129234889): PASS.

[UX evidence matrix](UX_ACCEPTANCE_EVIDENCE.md): 23 automated behavior PASS / 5 NOT VERIFIED. Every row separately marks native/emulator/physical/field acceptance unverified. UX-09 uses guarded automatic activation for a fresh-GPS new destination; manual upgrade still requires confirmation, replacement preview and explicit Start.

## Remaining gates

- Complete journey localization/accessibility and missing acceptance evidence; retain source/manual/upgrade guards.
- Finish evidence-based cleanup, current documentation reconciliation and safe branch/worktree consolidation. One active checkout has **not** been achieved. Unknown drafts, ignored files, recovery archives and active processes must be preserved before any removal.
- Dependency audit: 66 package findings, 13 moderate / 52 high / 1 critical. [Complete package-level triage](DEPENDENCY_SECURITY_STATUS.md) and [#370](https://github.com/ghilmanITM360/offline-map/issues/370) record consumers, exposure and deferrals. Tooling vulnerabilities remain; no zero-vulnerability or release-exception claim for these new findings.
- Current emulator campaign unavailable: no attached adb device; prior boot attempt was disk-blocked. Native Settings/GPS, audible TalkBack/VoiceOver, Urdu review, actual 320dp/200% rendering, airplane-mode runtime and physical walking remain unverified for this candidate.
- Gates 18/19 (#43/#44), venue walking (#46), Mimbar ground truth (#116) remain field-required; proxy deployment (#123) remains an owner/external gate. No field issue closes on software tests.

No APK, store/registry publication or production deployment was performed by this campaign. Older APKs and historical emulator claims cannot certify this source revision.
