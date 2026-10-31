# Final engineering QA verdict — 1 November 2026

**Engineering software closure complete — independent and external acceptance pending.**

Final source: `1a913b9e521c093499855625c8b3a76cc11fd61a`; clean feature branch, local/origin/live remote equal. Sole implementation ownership was transferred to this Codex chat. No new branch/worktree/clone, native build, destructive cleanup or external distribution occurred. Two original stashes/worktrees and integration baseline are preserved (FINAL_STATE.json).

## Software results (author-side SOURCE/RUNTIME)

| Gate | Result | Exact evidence |
| --- | --- | --- |
| DELIV-01 | PASS; independent acceptance pending | Original correction91de2d1 preserved. Final actual archive73payload files,12packfiles plus shared PMTiles, pins/checksums/metadata PASS; accepted-bundle-build.log. |
| SUP-01 | PASS engineering disposition; external/security acceptance pending | Published PostCSS8.5.32 + coherent Metro0.83.8 patch family. Fresh root57entries(6low51moderate0high0critical),4distinct sources; actual delivered consumer43entries(6low37moderate0high0critical),3sources. Audit exits1, not suppressed. Exact versions/parents/GHSA/CVE and conditional E1/E2/E4 disposition are shipped. |
| REG-01 | PASS | Original57tests pass3focused runs. Latest post-Metro full222/222suites and2367/2367tests. No test/product/timeout change. hotfix-components-results.json; reg-repeatability.json. Host pressure observed; historical causality remains unproven. |
| Final source | PASS | App/scripts types; ESLint0errors2pre-existingwarnings; full npmtest including14security checks;2400differential and91506golden pairs unchanged;83headless and8export checks; compiled package runtime/declarations/allowlist/license and byte reproduction. hotfix-* logs. |
| Delivered consumer | PASS | Clean shipped-lock npmci, TypeScript,6suites63tests,14security checks. Android production export772modules/14.48s and iOS774modules/13.44s, both exit0. All sources contained, original files/lock/assets unchanged, no extra assets injected. accepted-* logs and source inventories. |

Root validation ran on the working source subsequently committed as1a913b9; executable inputs/locks match that commit. Final archive and consumer commands ran after that exact commit. Prior historical tests are not relabelled as new executions. No routing golden was regenerated. SDK/runtime/app/GIS/compiler/pins/native source remains unchanged from audited923a604; original16independent findings retain their original SOURCE/RUNTIME evidence.

## Artifacts

- bundle: `82b32fd74702a2e29ee8ff3913765c9591110b5d58eb7fec4c0730db72e8972e`
- sdk: `d722ce2541c3cd179cd0ce19ecf9536ec50481ace08beea3a0ef61f19dd29cca`
- consumerLock: `64e9d1190452c48d7379c8fd598b6ccac10fc2070fac9aa98fcba4ebb0b06e68`
- manifest: `9b8fec4a704dd3f2de69ab85de302f21299ae26606fde82d3947191de572c947`
- checksums: `5922cca5270c16bc5db88280c03994b73114de6fe254db74570c87e97089ca0f`

Durable archive: `/Users/ghilmankhan/Documents/offline-map-audits/offline-sdk-release-closure-2026-10-31/delivery-1a913b9-final.tgz`. Manifest/CHECKSUMS cover all73payloads; FINAL_ARTIFACT_IDENTITIES.json records sizes/full paths. Bounded secret scan0hits; canonical Apache2.0 verified; Metro's vendored third-party MIT notice retained/hashed. No general external/native security certification is claimed.

## Rejected candidate and corrections

10bb3b4 candidate (bundle8bba05ef…) is **rejected and preserved**. The original buffer-only probe missed Metro's filename API removed by image-size2. Actual Android export caught the failure. Expanded file-path regression watched RED; supported Metro0.83.8 removes the dependency and passes14checks plus both real exports. No local parser backport/adapter or fabricated risk acceptance.

Changed commits after accepted DELIV baseline:

1a913b9e521c093499855625c8b3a76cc11fd61a fix(sdk): use supported Metro security patch for asset compatibility
10bb3b4cac83b7676fc9c70f4835a95a8a80b9fe docs(sdk): reconcile release evidence and focused acceptance handoff
7726d9135f51f70561efbc40eb3eb3bfc4628153 fix(sdk): patch build dependency advisories with verified overrides


## Release verdicts and remaining gates

Controlled pilot: engineering candidate ready under documented reviewed/pinned build-input restrictions; **release GO withheld pending focused independent final acceptance and owner/security decisions**. The remaining low/moderate config/pattern tooling risks are conditional engineering exceptions, not invented owner/external approval.

Unrestricted production: **NO-GO**. Physical iOS/Android walking and J01–J18, continuous physical-iPhone GPS, whole-device cold airplane mode, audible VoiceOver/TalkBack, reviewed Urdu/Roman Urdu, venue redistribution rights, supported Gate18/19 survey, external/native security review, signing and authorized distribution remain open. No known remaining reproduced software defect in the accepted candidate; no unexecuted physical scenario is marked passed.

Independent review: focused final release acceptance **pending**. A fresh-context engineering code review identified a portable-fixture improvement, fixed using os.tmpdir; its early compatibility assessment was superseded by actual export evidence. It is not independent final approval. The next reviewer should verify DELIV/SUP/REG, current archive/lock and affected regressions, not reopen all16unchanged original findings.

## Decisions retained

Use approved existing checkout/evidence workspace; no automatic deletion. Prefer published Metro security patch over local backport after real export disproved direct image-size compatibility. Preserve earlier source/audits/APKs and failed candidate. General hostile-tar ingestion is outside this trusted-producer verifier's guarantees. No minor product refactor was introduced.
