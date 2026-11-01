# External review and owner decision requests

All decisions here are **PENDING**. Responsible roles are proposed; no external reviewer, rights holder or signing custodian has accepted an assignment. This packet does not create legal wording, release authorization, signatures or keys. Use [the gate matrix and identity contract](README.md) for every decision.

## Independent software and security review packet

Owner nominates a reviewer independent of this implementation. Review source `1a913b9e521c093499855625c8b3a76cc11fd61a`, exact D1/S1/L1 and the separately hashed root lock. Do not reopen the original 16 SOURCE/RUNTIME PASS findings without a relevant change. The fresh-context review inside the author's Codex chat is additional engineering evidence, not organizationally independent security acceptance.

Give the reviewer these existing records via an owner-approved private channel; no new archive or external transmission is necessary to prepare the assignment:

- [Accepted artifact paths/bytes/full SHA-256](../FINAL_ARTIFACT_IDENTITIES.json), [current rehash/source inventory](RECONCILIATION.json), [engineering results and reproduction](../focused-review/README.md), [47 raw evidence hashes](../focused-review/EVIDENCE_SHA256.json) and [command index](../focused-review/COMMAND_INDEX.md). Relative raw log paths in those records resolve to their documented durable external evidence base.
- [Focused independent handoff with exact commands](../../client/INDEPENDENT_RELEASE_CLOSURE_HANDOFF.md): actual standalone delivery inventory, clean install, consumer tests/types, both production Metro exports, containment/no injection, actual Metro/PostCSS regressions, original timeout scenarios and package reproducibility.
- [Complete per-advisory disposition](../../client/DEPENDENCY_ADVISORY_DISPOSITION.md) and [installed version/path/constraint snapshot](../../client/DEPENDENCY_AUDIT_SNAPSHOT.json). Exact root lock SHA-256: `760e0aac4cf4651554a55b59f6be196697e579c7ae8a5413e336ac852b92b80b`; consumer L1: `64e9d1190452c48d7379c8fd598b6ccac10fc2070fac9aa98fcba4ebb0b06e68`.

Latest executed engineering audit evidence: root **57 propagated entries / 4 distinct source advisories**, 6 low / 51 moderate / 0 high / 0 critical; delivered consumer **43 / 3**, 6 low / 37 moderate / 0 high / 0 critical. Both exits **1**, not clean audits. These counts were freshly reconciled in the preceding focused review, **not rerun in this documentation task**. At external review, run the exact-lock metadata command below, retain its actual exit/JSON/time/hash and reassess any changed advisories rather than assuming these counts remain current:

```sh
npm audit --package-lock-only --ignore-scripts --json --fetch-retries=0 --fetch-timeout=20000
```

Execute once in the canonical checkout read-only and separately in the actual isolated delivered consumer. Do not alter locks, install into the implementation checkout or suppress nonzero results. Fresh review may reuse the bounded independent reproduction instructions; no new worktree/branch/clone or native build is implied.

| Exception / current advisory | Reviewed exposure and residual risk | Proposed conditions, requiring explicit reviewer/owner acceptance | Decision / approver / evidence |
| --- | --- | --- | --- |
| E1: deepmerge 4.3.1, low, GHSA-gcqx-w48m-w2h4 / CVE-2026-93753 | Expo/Jest project configuration merging; malicious configuration can poison returned-object behavior. Transitive does not mean harmless. No compatible patched release identified in recorded research. | Reviewed pinned configuration/plugins only; isolate builds; prohibit untrusted configuration/PR inputs on privileged builders. Reassess on upstream patch or changed callers. | BLOCKED; PENDING named security reviewer and owner; no approval reference |
| E2: glob 13.0.6, moderate, GHSA-3g3m-2fjr-6pw4 / CVE-2026-118773 | Filesystem discovery can continue costly abort-budgeted traversal; hostile tree availability risk. Patched 14.0.2 outside current parent ranges. | Reviewed pinned input trees; isolated bounded builds without signing secrets; do not process hostile uploads/trees. Reviewer checks actual call sites and current support status. | BLOCKED; PENDING |
| E2: minimatch, moderate, GHSA-g3hv-75wg-m249 / CVE-2026-118764 | Root 3.1.5/9.0.9/10.2.5; consumer 3.1.5/9.0.9/10.2.6. Hostile patterns can exhaust resources in modern optimization paths; legacy 3 lacks the exact algorithm despite broad advisory range. Fixed 11.0.1 outside current parent ranges. | Fixed reviewed patterns only; no untrusted pattern input to privileged builds; isolation/resource bounds. No blanket “unreachable” finding for every transitive consumer. | BLOCKED; PENDING |
| E4: root-only uuid 7.0.3, moderate, GHSA-w5hq-g745-h8pq / CVE-2026-41907 | Recorded xcode caller uses v4 with no output buffer; advisory requires v3/v5/v6 plus caller buffer. Fixed 11.1.1 outside xcode range. Absent from delivered consumer. | Reviewer confirms API/caller evidence, accepts scoped non-reachability and recheck on caller/lock change. This is not a blanket uuid safety claim. | BLOCKED; PENDING |

The former image-size exception is not retained: the accepted published Metro 0.83.8 hotfix removes image-size, with actual buffer/file-path hostile-image regressions. PostCSS 8.5.32 fixes four source advisories. The earlier direct image-size 2.x candidate failed actual export and is rejected, not an alternative release. See the full disposition for all original GHSA/CVE entries and preserved raw evidence. Current patch graph deliberately overrides Expo pins on Metro's patch line and PostCSS's existing major; compatible-host assumptions must stay scoped to tested builds.

Security reviewer deliverable: named/dated signed report covering exact locks, direct/transitive paths, call-site/attacker prerequisites, SDK versus host/tooling/native boundaries, each exception's accept/reject decision, required controls, residual severity, expiry/recheck triggers and pilot/production recommendation. Owner must explicitly accept any residual risk for the defined scope. If a material reachable high/critical issue is found or conditions cannot be enforced, release remains blocked. A low/moderate label alone is not approval.

Native security remains separately open: obtain the actual P target's Podfile.lock, Gradle dependency report, Hermes/MapLibre versions, permissions/entitlements, storage/backup/network behavior and production SBOM/notices. JS npm audit and no direct SDK runtime dependencies do not certify native libraries or the host. No credentials or keys belong in this packet. Location traces remain private; evidence sent for review must be consented and sanitized.

## Translation approval procedure

[TRANSLATION_REVIEW.csv](TRANSLATION_REVIEW.csv) copies all 89 existing keys and English/candidate strings exactly from `examples/expo-consumer/copy/translationTable.ts`; 26 have reused host wording, 63 have no wording. All Urdu/Roman Urdu statuses start **NOT RUN** and all owner approvals **PENDING**. The canonical generated [inventory](../../client/TRANSLATION_REVIEW.md) is authoritative; older “88 strings” prose is historical and not used for this review. Do not manually edit generated inventory or shipped copy during acceptance preparation.

1. Owner assigns fluent Urdu and Roman Urdu reviewers, dates and the exact target copy/build identity. Review each key in its actual context, not as a detached glossary; visit every directory, preview, permission/precision blocker, error, step, reroute, GPS, arrival and Exit state.
2. Fill proposed wording separately from existing unapproved candidates. Preserve placeholder identities/multiplicity and intended ordering; substitute actual numbers, distances and long mixed-script place names. Verify left/right/distance, precision/permission safety meaning and refusal/fallback wording. No machine-generated wording is inserted by this packet.
3. Record context screenshots and spoken-reader evidence on both P targets. Urdu uses local RTL; Roman Urdu remains LTR; physical map coordinates/orientation must not mirror. J16/J17 cover speech, largest text, narrow devices and themes. Record unavailable voices or fallback English; do not count fallback as a completed translation.
4. For each locale/key record reviewer/date, proposal or explicit contextual approval of existing text, evidence path/hash and owner approval. Missing/rejected entries keep that locale gate blocked. Store the reviewed worksheet as an immutable version; retain the original.
5. Accepted wording is input to a **separate authorized copy change** with relevant generated checks/build/layout acceptance, not permission to modify code here. If copy/binary bytes change, record a new target identity and relevant retest; do not overwrite accepted package identities or attach approval to untested text.

## Gate 18/19 survey request — no connectivity change

Owner assigns qualified surveyor and venue representative; obtain access/date and rights to use/redistribute survey results. Existing dataset coordinates are **not fresh official field confirmations**: Gate18 `24.975395, 67.014922`; Gate19 `24.975367, 67.012898`. Both are `ground_truth_required`; Gate19 also `needs_verification`. Existing metadata says Gate18 has no valid internal connector within 320m. Generic coordinate-based `routingStatus` is not connector eligibility. See [gate source](../../../../src/data/ijtema/gates.ts) and [GIS requirements](../../../DATA_GIS_AND_FIELD_REQUIREMENTS.md).

For each gate collect authoritative gate identity/role, measured coordinates, CRS, device/method, horizontal accuracy and time; continuous permitted pedestrian connector geometry from gate to confirmed internal graph; endpoints, walking direction, barriers/closures, surface/accessibility, seasonal restrictions and permission authority. Retain original photos/private tracks, hashes, survey notes, safety discrepancies, date/expiry and venue-owner acceptance. Surveyor must state uncertainty and which links were actually walked. A straight line, satellite appearance or nearest-node snap is not evidence of a connector.

J18 survey and J09 walking remain BLOCKED. Gates stay map-visible but unavailable for normal search/route selection/outside starts. Owner may explicitly exclude them from a restricted scope; that decision does not pass J18 or authorize invented edges. Any accepted later data change requires its own implementation approval, compiler pins, unchanged-golden impact review and field retest. No GIS resource is changed here.

## Venue rights, OSM attribution and notices

Owner obtains written approval from an authorized venue-data rights holder covering the exact D1 graph/places/gates/localization/survey resources: recipient, purpose, territory/duration, redistribution/modification, required credit, restrictions and signatory authority. These terms are **not recorded** today. Do not create a legal grant or privacy policy on the owner's behalf. Keep delivery private pending a decision.

Basemap facts: `assets/offline-map/BASEMAP_PROVENANCE.json` records OSM snapshot `2026-10-05T09:00:51Z`; PMTiles 434,589 bytes, SHA-256 `d5e6883d55d55b0fa9e3230ab92585fb25a8949551528ef4d176192384a28cc0`. This preparation freshly hashes the committed PMTiles. Preserve provenance, pack pins, Apache-2.0 text and third-party notices, including Metro's vendored MIT notice. Native notices remain host-build work.

OSM data is licensed under [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/). Preserve the existing `© OpenStreetMap contributors` credit and licence information. The [OSMF attribution guidance](https://osmfoundation.org/wiki/Licence/Attribution_Guidelines) covers legible attribution on interactive maps and database notices; verify the approved host visibly presents credit and offers accessible licence details, including offline presentation. The [OSM copyright page](https://www.openstreetmap.org/copyright) explains credit and applicable share-alike requirements. Owner/legal reviewer must determine whether the shipped datasets/outputs trigger derivative-database, offer or share-alike obligations for the actual distribution. This packet makes no legal-compliance or proprietary venue-rights finding. OSM rights do not establish venue survey ownership.

Required approval: rights-holder document path/hash, authorized signatory/date/scope, legal review of ODbL/distribution obligations and actual host screenshots/notices. **Status BLOCKED / approval PENDING** for both venue rights and final distribution compliance.

## Production signing and distribution decisions

No account/keystore/certificate/private key inspected, created, requested, exported or changed. No store upload, package publication or external distribution performed. SDK is private/unsigned and imported/remote packs remain refused without trusted signing infrastructure.

| Decision owner | Decision/evidence required before readiness | Current result |
| --- | --- | --- |
| Owner + Android signing custodian | Host app/package id and release version; test versus production channel; upload/app-signing authority, key custody/recovery/rotation and access controls; public certificate SHA-256; approved APK/AAB hash and actual signature verification | BLOCKED; no final production identity/custody approval recorded |
| Owner + Apple signing custodian | Host bundle id/version; team/account role; device-test/ad hoc/TestFlight/App Store route as appropriate; device provisioning, public certificate/profile metadata, custody and approved archive/IPA/build identity | BLOCKED; simulator executable is not device/distribution evidence |
| Owner + release approver | Authorized recipients/channel/date, required security/rights/device approvals, privacy/support facts and rollback/incident owner; signed pilot scope or production decision | BLOCKED; preparation does not authorize installation/distribution to end users |
| Owner + pack trust authority | Separate pack publisher authenticity scheme/key custody if remote/imported packs are ever enabled | BLOCKED for import/remote support; retain current default refusal, no fabricated signing keys |

Use the [existing signing policy](../../client/RELEASE_SIGNING_AND_DISTRIBUTION.md), [Android signing documentation](https://developer.android.com/studio/publish/app-signing) and [Apple build upload process](https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds/) for the chosen channel; account owners verify current eligibility and requirements themselves. Android distinguishes upload and app-signing keys; Apple upload permissions and build identity must match the authorized account. Neither documentation nor possession of a sample debug keystore demonstrates production readiness. Record only public fingerprints/approval references in Git; never passwords, tokens, private profiles, keys or credential-bearing logs.

## Approval record requirements

Every decision states gate id, PASS/FAIL/BLOCKED/NOT RUN, exact artifact/lock/native-build or dataset identity, evidence paths/bytes/SHA-256, reviewer identity/independence/date, open defects/remediation, scope/conditions/expiry and owner acceptance. A reviewer recommendation and final owner release approval are separate fields. No reply, an engineering PASS, an old emulator report or a completed template implies acceptance. Keep controlled-pilot and production decisions separate; both remain NO-GO at this checkpoint.
