# SDK engineering closure and single-checkout checkpoint — 1 November 2026

**Engineering software closure complete — independent and external acceptance pending.**

Engineering source and accepted delivery: `1a913b9e521c093499855625c8b3a76cc11fd61a`, issue [#393](https://github.com/ghilmanITM360/offline-map/issues/393). This documentation checkpoint records existing completed results; it does not rerun tests or regenerate artifacts. Later documentation-only commits do not change the accepted artifact source identity.

## Permanent repository rule

Only `/Users/ghilmankhan/workprojects/offline-map`, branch `feat/muslim-ummah-offline-navigation-sdk`, is authorized for SDK development, tests, documentation, releases and Git operations. One source writer. No additional worktrees, clones, implementation branches or divergent source copies. Temporary isolated build/consumer directories are permitted only when technically required and are not development checkouts. Independent reviewers inspect the canonical checkout read-only while a writer is active.

Every validated atomic change, QA result, release decision and handoff belongs in this repository under `docs/sdk/`, with explicit intended files committed and pushed normally. Check local/origin/live remote equality, clean status and exactly one registered worktree after pushing. Never rewrite history, force-push or touch `integration/ijtema-clean-baseline`; preserve historical stashes/evidence. Large binaries/caches/raw logs stay external with paths, hashes and reproduction instructions tracked here. No external publication/distribution without owner authorization.

## Worktree reconciliation

Owner-authorized supported `git worktree remove /Users/ghilmankhan/.codex/worktrees/6a1a/offline-map` exited 0. Before removal: detached `42451f1bc9deaeda822e5de5fca00782fd5e366b`, unlocked; tracked diff and all untracked/ignored inventories empty; 461 physical files exactly matched 461 tracked files. `lsof +D` returned no open files, and global cwd inventory showed no process rooted there. Only macOS provenance attributes existed, with no resource forks. Commit is retained by existing refs (including origin/main); no unique history was discarded. No force/removal workaround was used. Afterwards exactly one registered worktree remained at the authorized path. See [raw command outcomes](WORKTREE_RECONCILIATION.json).

Both original stashes remain `b5a47d6c39274b77d5cb8132e4c4b28f1092a734` and `6d4a9c8de0ab763ca3719b50caa2c782d9d11cce`. Protected integration baseline remains `9c0fd50d7434b5b2daf875f47fbb45ab6d444995`. Original audit and accepted/rejected delivery artifacts were not deleted or rebuilt.

## Recorded author-side SOURCE/RUNTIME results

| Gate | Completed engineering evidence | Acceptance boundary |
| --- | --- | --- |
| DELIV-01 | All 12 packfiles shipped, pinned identities unchanged; clean consumer install, TypeScript, 63 tests, Android and iOS production Metro exports exit 0; no implementation imports/injected assets/AppleDouble. | Independent final verification pending. |
| SUP-01 | PostCSS 8.5.32 and coherent Metro 0.83.8 patch. Root: 57 propagated entries, 4 sources (6 low/51 moderate); consumer: 43 entries, 3 sources (6 low/37 moderate). Both 0 critical/high; audit exits 1. | Conditional tooling exceptions documented, external/security acceptance pending; no fabricated owner acceptance. |
| REG-01 | Original scenarios unchanged; 3 focused runs pass 57 tests; final full component run 222 suites / 2,367 tests passes. | Historical timeout causation unproven; independent review pending. |
| Integration | Application/scripts types, lint (0 errors/2 existing warnings), npm test, 2,400 differential comparisons, 91,506 unchanged golden routes, 83 headless/8 export checks, package runtime/declarations/reproducibility pass. | Recorded source evidence, not new native/device acceptance. |

Original 16 independently passed findings retain their historical evidence. No SDK runtime/app/GIS/compiler/pins/goldens/native implementation change occurred in the closure corrections. Historical Android evidence spans pre-fix APK A and targeted corrected APK B checks; it is not a full rerun on B. The earlier iOS executable predates the final tarball. See [complete recorded verdict](FINAL_QA_VERDICT.md), [closure matrix](FINDINGS_CLOSURE_MATRIX.md), and [tracked client/security handoff](../client/INDEPENDENT_RELEASE_CLOSURE_HANDOFF.md).

## Verified artifact identities

[FINAL_ARTIFACT_IDENTITIES.json](FINAL_ARTIFACT_IDENTITIES.json) records durable paths, sizes and full hashes. All five preserved files were rehashed at this checkpoint:

- SDK: `d722ce2541c3cd179cd0ce19ecf9536ec50481ace08beea3a0ef61f19dd29cca`
- Complete delivery: `82b32fd74702a2e29ee8ff3913765c9591110b5d58eb7fec4c0730db72e8972e`
- Consumer lock: `64e9d1190452c48d7379c8fd598b6ccac10fc2070fac9aa98fcba4ebb0b06e68`
- Manifest: `9b8fec4a704dd3f2de69ab85de302f21299ae26606fde82d3947191de572c947`
- Checksums: `5922cca5270c16bc5db88280c03994b73114de6fe254db74570c87e97089ca0f`

73 payload files. No accepted artifact was regenerated. Reproduction commands, exact cwd/exit/durations and log paths are in [COMMAND_INDEX.md](COMMAND_INDEX.md) and the client handoff. [EVIDENCE_MANIFEST.json](EVIDENCE_MANIFEST.json) records freshly verified hashes of the preserved raw logs/reports. Copied reports are byte-exact historical snapshots: their earlier two-worktree inventory/preservation instructions are superseded by this owner directive and reconciliation; their tested source/results remain historical, not fresh independent approval.

## Remaining work and verdict

Focused independent review of DELIV-01/SUP-01/REG-01 and final reproduction is pending; do not reopen the 16 original passes without relevant source changes. Physical iOS/Android GPS/walking and remaining J01–J18, continuous physical-iPhone GPS, whole-device airplane-mode cold start, audible VoiceOver/TalkBack, reviewed Urdu/Roman Urdu wording, owner-approved venue redistribution rights, supported Gate 18/19 field survey, external security acceptance, production signing and distribution decisions remain open.

Controlled-pilot release GO remains withheld pending independent/owner/security acceptance. Unrestricted production is **NO-GO**. No physical/field result is inferred from Jest/Metro. No newly reproduced software defect remains in the accepted candidate.

Resource check before this bounded documentation task: 87% five-hour, 59% weekly, no paid credits used. No builds, dependency installation or full suites repeated. Next action: an independent reviewer reads the tracked focused handoff and verifies the accepted artifact without creating another worktree or concurrent source writer.
