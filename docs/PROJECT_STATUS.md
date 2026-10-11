# Project Status

Current snapshot. Historical evidence is preserved in [the prior status](history/2026-10-06-project-status.md) and Git history; it does not certify this candidate.

**Updated:** 2026-10-11. **Canonical:** `integration/ijtema-clean-baseline`. **Verified source:** `c833814dec839f1cca249c25f760c232cd351b3d`, integrated as `b36e1e4ba7eebacf89f6db4bccb237014da95ce3` through #369, with identical trees.

**Current milestone: Phase A software stabilization — INCOMPLETE.** SDK extraction and Muslim Ummah development remain gated until software fixes, validation, relevant-branch reconciliation and safe single-checkout consolidation finish. Production/native/field acceptance has not been established.

## Integrated continuation work

PRs #357–366 preserve GPS quality, journey identity, activation/cancellation, destination-first Map setup, Directions PEEK/reopen, fresh-GPS automatic activation, explicit manual upgrades, permission recovery, generation-bound Directory choices/browsing restoration and hypothetical Block 2. This campaign additionally integrated:

- #367: Directory three-language labels, spoken actions, RTL, localized names and Roman Urdu search aliases.
- #368: manual Route Guide controls/counts and Directions Back labels/direction.
- #369: recovered #355 app-shell localization, preserving newer permission safeguards and correcting Help policy. #355 is closed as superseded; original branch/commits remain preserved.

PR #372 integrated LocationSheet localization at canonical `600180e151092bbb9bbe0ceaa3fe645583ff25a7`. Guidance continuation localizes generated app instructions, journey/recovery/error/arrival copy, navigation chrome and legacy descriptions through the existing catalogs, with stage-owned accessibility focus. Locale changes retain geometry, manual steps and speech ownership. Scanner measures 82 literals across 15 files, all classified in [the inventory](LOCALIZATION_SCANNER_CLASSIFICATION.json); counts are not proof of native translation quality. Unknown provider prose remains verbatim when semantic metadata is absent. Native focus, Urdu review and large-font layout remain unverified.

## Executed source checks

Against the verified source above:

- `npm run typecheck`: PASS.
- `npm run lint`: PASS, 0 errors / 1 existing generated markerImages warning.
- `npm test`: PASS, 106 command headings.
- `npm run test:components -- --runInBand`: PASS, 157 suites / 1,556 tests, 55.704 s.
- `git diff --check`: PASS.
- Four required routing commands: PASS separately; `test:all-gates-v2` reports 16 PASS / 2 field BLOCKED / 0 FAIL. Existing provider fixture warning: 789.1 m sanity cap. Existing act and Node-only hydration warnings remain.
- [Exact-head CI](https://github.com/ghilmanITM360/offline-map/actions/runs/38129234889): PASS.

[UX evidence matrix](UX_ACCEPTANCE_EVIDENCE.md): 24 automated behavior PASS / 4 NOT VERIFIED. Every row separately marks native/emulator/physical/field acceptance unverified. UX-09 uses guarded automatic activation for a fresh-GPS new destination; manual upgrade still requires confirmation, replacement preview and explicit Start.

## Remaining gates

- Complete journey localization/accessibility and missing acceptance evidence; retain source/manual/upgrade guards.
- Finish evidence-based cleanup, current documentation reconciliation and safe branch/worktree consolidation. One active checkout has **not** been achieved. Unknown drafts, ignored files, recovery archives and active processes must be preserved before any removal.
- Dependency audit: 66 package findings, 13 moderate / 52 high / 1 critical. [Complete package-level triage](DEPENDENCY_SECURITY_STATUS.md) and [#370](https://github.com/ghilmanITM360/offline-map/issues/370) record consumers, exposure and deferrals. Tooling vulnerabilities remain; no zero-vulnerability or release-exception claim for these new findings.
- Current emulator campaign unavailable: no attached adb device; prior boot attempt was disk-blocked. Native Settings/GPS, audible TalkBack/VoiceOver, Urdu review, actual 320dp/200% rendering, airplane-mode runtime and physical walking remain unverified for this candidate.
- Gates 18/19 (#43/#44), venue walking (#46), Mimbar ground truth (#116) remain field-required; proxy deployment (#123) remains an owner/external gate. No field issue closes on software tests.

No APK, store/registry publication or production deployment was performed by this campaign. Older APKs and historical emulator claims cannot certify this source revision.

## Guidance continuation gate

The guidance branch is validated and reviewed before integration; its exact head, CI and merge are reported in the PR and chat. Source tests cover deep-scroll Directory-to-Map, parameterized error localization, locale-switched active guidance/speech, focus stage ownership, manual guide preservation and stale cancellation alerts. Phase A remains incomplete until one clean main checkout exists. No worktree or branch is disposable merely because its source is old; preserve unique/dirty/ignored evidence and open PRs #178/#179. No SDK branch, APK or deployment is authorized by this continuation.
