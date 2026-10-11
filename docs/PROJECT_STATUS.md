# Project Status

Current snapshot. Historical evidence is preserved in [the prior status](history/2026-10-06-project-status.md) and Git history; it does not certify this candidate.

**Updated:** 2026-10-11. **Canonical:** `integration/ijtema-clean-baseline`. **Verified feature:** `143b23495d2e5bbaa858cb1150bdaee3716417fd`, integrated through [PR #373](https://github.com/ghilmanITM360/offline-map/pull/373) as **verified canonical source** `d2087aac01b9c2c82a1036247953191a479da0eb`. Fresh validation ran in the permanent checkout `/Users/ghilmankhan/workprojects/offline-map`.

**Current milestone: Phase A software stabilization — BLOCKED pending consolidation.** SDK extraction and Muslim Ummah development remain gated until software fixes, validation, relevant-branch reconciliation and safe single-checkout consolidation finish. Production/native/field acceptance has not been established.

## Integrated continuation work

PRs #357–366 preserve GPS quality, journey identity, activation/cancellation, destination-first Map setup, Directions PEEK/reopen, fresh-GPS automatic activation, explicit manual upgrades, permission recovery, generation-bound Directory choices/browsing restoration and hypothetical Block 2. This campaign additionally integrated:

- #367: Directory three-language labels, spoken actions, RTL, localized names and Roman Urdu search aliases.
- #368: manual Route Guide controls/counts and Directions Back labels/direction.
- #369: recovered #355 app-shell localization, preserving newer permission safeguards and correcting Help policy. #355 is closed as superseded; original branch/commits remain preserved.

PR #372 integrated LocationSheet localization at canonical `600180e151092bbb9bbe0ceaa3fe645583ff25a7`. PR #373 integrated guidance localization at `d2087aac01b9c2c82a1036247953191a479da0eb`. It localizes generated app instructions, journey/recovery/error/arrival copy, navigation chrome and legacy descriptions through the existing catalogs, with stage-owned accessibility focus. Locale changes retain geometry, manual steps and speech ownership. Scanner measures 82 literals across 15 files, all classified in [the inventory](LOCALIZATION_SCANNER_CLASSIFICATION.json); counts are not proof of native translation quality. Unknown provider prose remains verbatim when semantic metadata is absent. Native focus, Urdu review and large-font layout remain unverified.

## Executed source checks

Against the verified canonical source above, all nine commands recorded in `main-final-validation/results.json` exited 0:

- `npm run typecheck`: PASS.
- `npm run lint`: PASS, 0 errors / 1 existing generated markerImages warning.
- `npm test`: PASS, 106 command headings.
- `npm run test:components -- --runInBand`: PASS, 164 suites / 1,599 tests, 85.027 s.
- `git diff --check`: PASS.
- Four required routing commands: PASS separately; `test:all-gates-v2` reports 16 PASS / 2 field BLOCKED / 0 FAIL. Existing provider fixture warning: 789.1 m sanity cap. Existing act and Node-only hydration warnings remain.
- [Exact-feature-head CI](https://github.com/ghilmanITM360/offline-map/actions/runs/38163076846): PASS for `143b23495d2e5bbaa858cb1150bdaee3716417fd`.

The prior incomplete permanent-main dependency installation was repaired from a private lockfile-matched `npm ci` staging installation, then copied into the existing shared dependency directory. The lockfile and package manifest were unchanged. Post-repair typecheck and focused smoke checks passed (5 suites / 35 tests, 22.965 s), followed by the full permanent-main campaign above. Exact full logs are preserved under `/Users/ghilmankhan/.codex/recovery/journey-phase-a-continuation-20261011/main-final-validation/`; installation evidence is in `main-dependency-setup.json` in the same recovery root. Earlier missing-MapLibre/GeoJSON failures describe the superseded incomplete installation, not this validated source.

[UX evidence matrix](UX_ACCEPTANCE_EVIDENCE.md): 24 automated behavior PASS / 4 NOT VERIFIED. Every row separately marks native/emulator/physical/field acceptance unverified. UX-09 uses guarded automatic activation for a fresh-GPS new destination; manual upgrade still requires confirmation, replacement preview and explicit Start.

## Remaining gates

- Complete native localization/accessibility and missing acceptance evidence; retain source/manual/upgrade guards. The integrated software scope and scanner classification do not establish native acceptance.
- Finish evidence-based cleanup, current documentation reconciliation and safe branch/worktree consolidation. One active checkout has **not** been achieved. Unknown drafts, ignored files, recovery archives and active processes must be preserved before any removal.
- Dependency audit: 66 package findings, 13 moderate / 52 high / 1 critical. [Complete package-level triage](DEPENDENCY_SECURITY_STATUS.md) and [#370](https://github.com/ghilmanITM360/offline-map/issues/370) record consumers, exposure and deferrals. Tooling vulnerabilities remain; no zero-vulnerability or release-exception claim for these new findings.
- Current emulator campaign unavailable: no attached adb device; prior boot attempt was disk-blocked. Native Settings/GPS, audible TalkBack/VoiceOver, Urdu review, actual 320dp/200% rendering, airplane-mode runtime and physical walking remain unverified for this candidate.
- Gates 18/19 (#43/#44), venue walking (#46), Mimbar ground truth (#116) remain field-required; proxy deployment (#123) remains an owner/external gate. No field issue closes on software tests.

No APK, store/registry publication or production deployment was performed by this campaign. Older APKs and historical emulator claims cannot certify this source revision.

## Guidance continuation gate

Guidance PR #373 is merged after independent review and successful exact-feature-head CI. The permanent canonical checkout passed fresh source validation after its dependency repair. Source tests cover deep-scroll Directory-to-Map, parameterized error localization, locale-switched active guidance/speech, focus stage ownership, manual guide preservation and stale cancellation alerts. Phase A remains BLOCKED pending evidence-based branch/worktree consolidation; source validation alone does not close that gate. No worktree or branch is disposable merely because its source is old; preserve unique/dirty/ignored evidence and open PRs #178/#179. No SDK branch, APK or deployment is authorized by this continuation.

## Workspace consolidation checkpoint

Fresh inventory measured 77 registrations. Preservation-first normal Git removal retired 74 linked worktrees, and one already-missing registration was archived and pruned after a dry-run. Two registered checkouts remain: the permanent main root and the current Codex session at `/Users/ghilmankhan/.codex/worktrees/1fd4/offline-map`. Live Codex processes own the latter; it must remain until execution moves to the permanent root. Therefore the mandatory one-checkout gate is **BLOCKED**, despite passing software validation.

59 merged local branches were deleted with normal `git branch -d`; zero remote branches were deleted. Open PRs #178/#179 and the preserved #355 source remain protected. Recovery bundles, patch/file manifests, private configuration originals and independent disposition reviews are preserved outside active source. Older launch/harness experiments were archived under owner-delegated disposition, not merged. The retained historical snapshot includes optional GPS persistence throttling, measured banner label insets and fallback metadata that are not wholly superseded; preserving it does not certify or integrate those refinements.

The next consolidation action must run from a session attached to the permanent root, after the current session releases the last linked checkout. Recheck process ownership, refs, status and recovery hashes before ordinary removal; then verify exactly one registration and a clean canonical main checkout. No SDK branch may begin before that gate passes.
