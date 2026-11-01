# External release acceptance — 1 November 2026

**Engineering software closure complete — independent and external acceptance pending. Controlled pilot: NO-GO (approval withheld). Unrestricted production: NO-GO.**

This is a coordination packet, not a new implementation milestone or a release approval. Tracking: [#393](https://github.com/ghilmanITM360/offline-map/issues/393). Reviewed documentation HEAD: `4ff1b9b7946d904a062471734a86b92fbe8ba93e`. Accepted executable/artifact source: `1a913b9e521c093499855625c8b3a76cc11fd61a`. This packet changes no production source, dependency lock, pack, binary or accepted delivery.

## Preparation and evidence

- [x] Verify canonical branch, local/origin/live equality, clean starting tree, one worktree, stashes and protected baseline.
- [x] Rehash the five accepted artifacts; review the actual original J01–J18 plan and existing native boundaries.
- [x] Prepare platform/scenario records, field/offline/accessibility procedures and the 89-string human review worksheet.
- [x] Prepare security, rights, survey and signing decision requests; validate documentation and commit/push to the existing branch.
- [ ] Owner confirms devices, named testers, venue access, reviewers and signing custodians. No availability answer was received at this checkpoint.
- [ ] Appropriate reviewers execute tests and approve evidence against exact native build identities. No physical or external PASS is granted here.

The detailed [reconciliation](RECONCILIATION.json) records fresh artifact/source hashes and hardware observations. The original audit file was initially a cloud placeholder; it became readable and was copied byte-for-byte as [the original plan](MANUAL_DEVICE_TEST_PLAN.original.md), without modifying the original. Scenario summaries supplement that plan; they do not replace or weaken it.

## Available people, hardware and access

| Resource | Actual evidence / availability | Assignment |
| --- | --- | --- |
| Accountable release owner | Project owner account `ghilmanITM360`; owner directives authorize preparation, not acceptance. | Ghilmankhan: nominate reviewers, approve scope and distribution. |
| Physical iPhone | `xcrun devicectl list devices --timeout 10`: exit 0, “No devices found.” No phone identified in USB device-name enumeration. Remote/unpaired devices remain unknown. | Owner to confirm model, OS/build, availability and custodian. |
| Physical Android | No ADB server listener at local port 5037. No matching phone name in USB enumeration. Server not started; this does not establish that no Android hardware exists. | Owner to confirm model/API/OEM, low-memory/narrow representative and custodian. |
| Device/field/accessibility testers | No named human tester or appointment confirmed. Simulator names are not physical inventory. | Owner to nominate iOS, Android and experienced VoiceOver/TalkBack testers. |
| Urdu and Roman Urdu reviewers | No fluent reviewer or approval confirmed. | Owner to nominate native-language/context reviewers. |
| Venue access and survey | No permission, venue contact, safe route or date confirmed. | Owner to arrange venue representative and qualified surveyor. |
| Independent security reviewer | No organization/person engaged or approval recorded. | Owner to commission reviewer independent of implementation. |
| Production signing/distribution | Account authority, credentials, custody and channel not verified. No keys inspected or created. | Owner to nominate signing custodians and release approver. |

Local resource checkpoint: 20% five-hour / 63% weekly usage, zero paid credits used; approximately 12 GiB free, memory-pressure output 34% free. No competing SDK writer identified: observed Claude CLI sessions were observer sessions or the unrelated YIOS checkout. No SDK native build/test process was started. These are observations, not proof of people/devices available elsewhere.

## Exact identity contract

| ID | Identity and permitted use |
| --- | --- |
| D1 | Accepted private client bundle SHA-256 `82b32fd74702a2e29ee8ff3913765c9591110b5d58eb7fec4c0730db72e8972e`; 888,020 bytes. |
| S1 | SDK tarball SHA-256 `d722ce2541c3cd179cd0ce19ecf9536ec50481ace08beea3a0ef61f19dd29cca`; 107,061 bytes. |
| L1 | Delivered consumer lock SHA-256 `64e9d1190452c48d7379c8fd598b6ccac10fc2070fac9aa98fcba4ebb0b06e68`. Manifest/checksum identities and durable paths: [artifact record](../FINAL_ARTIFACT_IDENTITIES.json). |
| P-IOS | **No accepted final physical iOS binary identity recorded.** Target is approved device build consuming D1/S1/L1 and exact accepted source; binary/app/version/signing/native dependency identities must be entered before testing. |
| P-ANDROID | **No accepted final physical Android build identity recorded for this acceptance cycle.** Same D1/S1/L1 target; owner must select and approve exact APK/AAB/install identity and scope before testing. |
| Q-INJECT / Q-FAULT | **Not built or approved.** Dedicated, explicitly synthetic/fault-capable QA targets for J07/J15 and otherwise unobservable races. Never substitute these for real-GPS evidence. |

Do not assign P-IOS/P-ANDROID merely by renaming an old binary. Historical corrected APK B (`bdfe5c92…`) contains SDK S1, but predates the accepted tooling graph; its emulator evidence is historical, not a final physical-cycle acceptance. APK A (`e59518b9…`) is pre-inset fix. The earlier iOS simulator executable (`18933dab…`) belongs to source `4f9a4d2` / SDK `eab28df2…`, was not retained and cannot run on a physical iPhone. Full hashes and limits: [native evidence](../../client/SECURITY_AND_VALIDATION_REPORT.md#historical-native-evidence--retained-not-rebuilt-for-packagingtooling).

No native build is initiated by this packet. Once a device/test owner is available, select the exact target and installation/signing route. A physical iPhone needs a device-compatible approved build; if none exists, that is the specific reason to schedule a build. Record provenance and rerun relevant acceptance for its bytes. Preserve old binaries. No keys, publication or distribution are authorized by preparing these instructions.

## Release acceptance matrix

“BLOCKED” means a prerequisite prevents execution/approval; “NOT RUN” means scheduled/ready but unexecuted; “FAIL” requires observed contrary behavior; “PASS” requires reviewed evidence. Each platform/run needs its own record. All external owner roles below are proposed responsibilities; named acceptance is unconfirmed.

| Gate | Accountable / executing owner | Exact identity scope | Required evidence | Status | Open defect / remediation reference | Final approval |
| --- | --- | --- | --- | --- | --- | --- |
| Engineering implementation | Codex implementation author; owner receives | Source `1a913b9…`, D1/S1/L1 | Completed source/package/routing records and focused review | PASS — SOURCE/RUNTIME only, previously executed | No remaining reproduced software defect; DELIV-01/SUP-01/REG-01 engineering work complete | Engineering record only; no external release approval |
| External final reviewer | Owner nominates independent reviewer | D1/S1/L1; reviewed HEAD above | Scoped signed decision for delivery, SUP/REG and reproduction; evidence hashes | BLOCKED | Reviewer/engagement unconfirmed; [focused record](../focused-review/README.md) is same-chat engineering review | PENDING |
| Physical iOS GPS/lifecycle | Owner / iOS QA | P-IOS, currently unassigned | Per-J scenario video, real timestamp/callback traces, exact model/OS/build | BLOCKED | Hardware, tester, final build and observability missing; [J matrix](J01_J18_ACCEPTANCE_MATRIX.md) | PENDING |
| Physical Android GPS/lifecycle | Owner / Android QA | P-ANDROID, currently unassigned | Same; low-memory representative; arrival inset at font/navigation variants | BLOCKED | Hardware, tester and final build missing | PENDING |
| Whole-device offline cold launch | Owner / both platform QA | P-IOS and P-ANDROID | J14 empty-install + warm-data recordings, radios/settings and absence of remote dependency | BLOCKED | Physical/build prerequisites; no whole-device result | PENDING |
| Field routes / Gates 18–19 | Owner / venue representative + surveyor | D1 pack pins, P-IOS/P-ANDROID; survey dataset identity | J09/J18 measured permitted paths, consent, rights and signed survey decision | BLOCKED | Access and authoritative survey absent; #43/#44; no connector inferred | PENDING; gates remain unsupported |
| VoiceOver/TalkBack | Owner / experienced accessibility testers | P-IOS/P-ANDROID, OS/reader/voice versions | J16 audible recording, focus order, critical state transitions, largest text | BLOCKED | No human audible acceptance; [procedure](J01_J18_ACCEPTANCE_MATRIX.md) | PENDING |
| Urdu/Roman Urdu | Owner / fluent reviewers + accessibility QA | 89-key worksheet and source hash; tested P identities | Every locale/key reviewed, placeholders/context/speech/layout; named dated approval | BLOCKED | 26 reused entries unapproved, 63 missing wording; [worksheet](TRANSLATION_REVIEW.csv) | PENDING |
| Security exceptions and native review | Owner / independent security reviewer | D1/S1/L1 + root lock; native target manifests | E1/E2/E4 explicit decisions, current audits, native scope and residual-risk acceptance | BLOCKED | Low/moderate tooling risk remains conditional; [review packet](REVIEW_AND_APPROVALS.md) | PENDING; engineering judgment is not external acceptance |
| Venue/OSM/licence rights | Owner / authorized rights holder and legal reviewer | Exact D1 resources, provenance and notices | Written venue redistribution grant, OSM/ODbL assessment and visible notices | BLOCKED | Venue terms unrecorded; no legal approval inferred from OSM licence | PENDING |
| Production signing/distribution | Owner / signing custodians | Actual host app id/version/binary/certificate/channel, currently unset | Public certificate fingerprints, authorized channel, custody/recovery and final release decision | BLOCKED | No production signing readiness verified; sample debug signature is insufficient | PENDING |

## Coordination sequence and record handling

1. Owner fills hardware/tester/access roster and confirms reviewer independence. Record named acknowledgements and appointment dates; no invitations or third-party messages were sent by this session.
2. Reviewers receive the existing private packet only through an owner-approved channel. Security/rights reviewers assess [the decision requests](REVIEW_AND_APPROVALS.md). No external distribution has occurred.
3. Establish P-IOS/P-ANDROID and any separately authorized QA target. Record full identities before installing; do not wipe a tester's personal data to manufacture an empty-install case.
4. Execute [J01–J18 procedures/matrix](J01_J18_ACCEPTANCE_MATRIX.md), keep each platform, real/synthetic and build separate. Use [the result template](ACCEPTANCE_RECORD.template.json) per run; never edit the preserved original plan.
5. Store original media/tracks privately and durably with consent. Hash originals and copies; track sanitized summaries, paths, sizes and SHA-256 here. Do not commit precise walking tracks, serial numbers, signing material, account identifiers or secret-bearing logs.
6. Reviewer records PASS/FAIL/BLOCKED/NOT RUN, defects/remediation references and a separate final approval. Owner signs a scoped pilot decision only after reviewing prerequisites; otherwise pilot stays NO-GO. Production remains NO-GO while any required external gate is open. If Gate 18/19 are excluded, owner must explicitly approve that restricted scope; do not silently waive J18.

The final preparation checks are in [VALIDATION.md](VALIDATION.md). This packet does not manufacture an acceptance deadline, legal grant, human signature or hardware result.
