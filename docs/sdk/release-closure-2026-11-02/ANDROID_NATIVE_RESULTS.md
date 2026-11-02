# Android native acceptance — current and prior executables separated

Current source085a493; APK SHA256d071437ce60366fdcf11c573a0736b127b605706f6b11420f366e0b890afeed2. Production Release/ARM64/Hermes/new architecture, template debug signing only. Build37.698s. Actual SDK tarballd1260aaa49d771072a8ce51d097fe4f1225339020181fd3358cdc3fee906123c; all13APK assets verified. ExistingAPI36ARM64Codex_Ijtema_API36/hostGPU/2048MB/2cores.

**Current35-row matrix:12PASS /0FAIL /0BLOCKED /23NOT RUN.** These results do not inherit old-binary passes after executable changes. A single background recovery also passes(P12); it does not re-certify the20-cycle row. Native font/source fix is accepted; complete virtual acceptance remains partial.

| ID | Scenario | Status | Evidence/limit |
|---|---|---|---|
| A01 | Release build/install/cold launch | PASS | production-build identity/build37.698s; P01 |
| A02 | Karachi offline startup/map | PASS | P01 bundled Karachi map |
| A03 | Offline directory/search selection | PASS | production touch/dump commands |
| A04 | Manual origin and111m preview | PASS | Gate01→Gate02 manual111m; commands/P01 |
| A05 | Manual Next/Previous/Recenter | PASS | P03 Next/Previous at2.0 |
| A06 | Journey retained through font-setting changes | PASS | P01/P02/P08 retainedstep2 |
| A07 | Existing text enlarges dynamically | PASS | 47/69→88/97px; Urdu reverse; production-font-measurements-v2.json |
| A08 | Dark map and system bars | PASS | P06 actual Dark map/app/status/navigation bars |
| A09 | Light/System appearance transitions | PASS | P06/P07/P09/P11 Dark/Light/System |
| A10 | Urdu/Roman Urdu/English journey retention | PASS | P05/P08/P10/P11 Urdu/Roman/English step2 |
| A11 | Effective offline cold/warm launch | NOT RUN | Previous-binary evidence retained below; final executable retest pending |
| A12 | Offline manual route/guide | NOT RUN | Previous-binary evidence retained below; final executable retest pending |
| A13 | Real filesystem pack lifecycle lab | NOT RUN | Previous-binary evidence retained below; final executable retest pending |
| A14 | Native permission denial | NOT RUN | Previous-binary evidence retained below; final executable retest pending |
| A15 | Native approximate permission rejected | NOT RUN | Previous-binary evidence retained below; final executable retest pending |
| A16 | Precise GPS candidate acquisition | NOT RUN | Previous-binary evidence retained below; final executable retest pending |
| A17 | Candidate cancellation/reacquisition | NOT RUN | Previous-binary evidence retained below; final executable retest pending |
| A18 | Explicit native Live confirmation | NOT RUN | Previous-binary evidence retained below; final executable retest pending |
| A19 | Native provider movement | NOT RUN | Previous-binary evidence retained below; final executable retest pending |
| A20 | Native lost signal and recovery | NOT RUN | Previous-binary evidence retained below; final executable retest pending |
| A21 | Offline native Arrival | NOT RUN | Previous-binary evidence retained below; final executable retest pending |
| A22 | Arrival Recenter/Done touch and exit | NOT RUN | Previous-binary evidence retained below; final executable retest pending |
| A23 | True200% Arrival touch clearance | NOT RUN | Previous-binary evidence retained below; final executable retest pending |
| A24 | 20background/foreground cycles | NOT RUN | Previous-binary evidence retained below; final executable retest pending |
| A25 | 20new navigation sessions | NOT RUN | Previous-binary evidence retained below; final executable retest pending |
| A26 | Bounded native watcher ownership/cleanup | NOT RUN | Previous-binary evidence retained below; final executable retest pending |
| A27 | Native reroute and repeated reroutes | NOT RUN | Previous-binary evidence retained below; final executable retest pending |
| A28 | Three-button versus gesture controls | NOT RUN | Previous-binary evidence retained below; final executable retest pending |
| A29 | Small-screen/accessibility-service traversal | NOT RUN | Previous-binary evidence retained below; final executable retest pending |
| A30 | Remaining native manifest/pointer/signature faults | NOT RUN | Previous-binary evidence retained below; final executable retest pending |
| A31 | Offline two-venue round trip | NOT RUN | Previous-binary evidence retained below; final executable retest pending |
| A32 | Native attribution dialog opens | PASS | P15 MapLibre Android dialog/P16 exit; legal acceptance separate |
| A33 | Pan then recenter camera behavior | PASS | P12 baseline/P13 pan/P14 recenter screenshots inspected; step2 retained |
| A34 | Rapid permission/noisy duplicate/out-of-order native fixes | NOT RUN | Previous-binary evidence retained below; final executable retest pending |
| A35 | Long-duration performance/leak closure | NOT RUN | Previous-binary evidence retained below; final executable retest pending |

New evidence `<E>/native/final-085a493` P01–P16, and `<E>/native/resume-20261102-font`. Native compiler warns about Kotlin INVISIBLE_REFERENCE suppression: the internal initializer is deliberately pinned to RN0.81.5 and must be revalidated with RN/Kotlin upgrades. No force/reset flag API is used. Production metadata v1 inherited three old fields; v2 corrects actual SDK/consumer-lock/build-time while preserving the same APK SHA. Use v2 only.

## Prior executable checkpoint (historical, not current acceptance)

# Android native acceptance — partial

Accepted source70275f3; ARM64 Release Hermes/new architecture, template debug signing (not production signing). APK SHA256`7b343f5b15a3588bd78fb670e0d2123b3e373259f74d512c290a8a9918d9030f`,34392992bytes. Build90.982s, command and all13asset hashes in FINAL_ARTIFACT_IDENTITIES.json. Existing Codex_Ijtema_API36/API36ARM64/hostGPU/2048MB/2cores; no new AVD. CandidateA and diagnostic C/D are preserved separately and never inherited as final-binary acceptance.

This checkpoint defines35 explicit scenarios: **25PASS / 1FAIL observation / 9NOT RUN**. Native pack lab adds10/10subchecks withinA13; repetition rows each contain20 iterations. These are a different breakdown from historical HomeMac8/1/1; totals are not combined.

| ID | Scenario | Status | Evidence/limit |
|---|---|---|---|
| A01 | Release build/install/cold launch | PASS | B01; 990ms TotalTime; actual APK all13assets verified |
| A02 | Karachi offline startup/map | PASS | B13/B14; pinned pack; visible bundled roads |
| A03 | Offline directory/search selection | PASS | B15/B16 |
| A04 | Manual origin and111m preview | PASS | B16 |
| A05 | Manual Next/Previous/Recenter | PASS | B02–B05/B17; actual touches |
| A06 | Journey retained through font-setting changes | PASS | B44–B46 step2; rendered scaling is separate |
| A07 | Existing text enlarges dynamically | FAIL | B44–B46 measured text heights unchanged; C/D diagnostics rejected |
| A08 | Dark map and system bars | PASS | B06 inspected screenshot; historical VIRT01/02 mismatch not reproduced |
| A09 | Light/System appearance transitions | PASS | B07–B09/B12 |
| A10 | Urdu/Roman Urdu/English journey retention | PASS | B10/B11/B12; RTL screenshot; linguistic approval separate |
| A11 | Effective offline cold/warm launch | PASS | No default network/no routes/IP+DNSdenial; B13/B14 |
| A12 | Offline manual route/guide | PASS | B16/B17 |
| A13 | Real filesystem pack lifecycle lab | PASS | 10/10 subchecks; B24/B25; storage-pressure port injected |
| A14 | Native permission denial | PASS | B26/B27; manual alternative preserved |
| A15 | Native approximate permission rejected | PASS | B30/B31; permissions captured |
| A16 | Precise GPS candidate acquisition | PASS | B32; real emu geo fix, device adapter |
| A17 | Candidate cancellation/reacquisition | PASS | B33/B34; early automation tap retried |
| A18 | Explicit native Live confirmation | PASS | B36 live; B35 was still asynchronous candidate |
| A19 | Native provider movement | PASS | B38;111→91m, existing graph fixture only |
| A20 | Native lost signal and recovery | PASS | B36 lost; B38 recovered; B37 still lost |
| A21 | Offline native Arrival | PASS | B39; emulator GPS provider, not field GPS |
| A22 | Arrival Recenter/Done touch and exit | PASS | B41/B42/B43; normal rendered text; safe-area screenshot |
| A23 | True200% Arrival touch clearance | NOT RUN | Setting2 alone did not prove enlarged text; prior claim withdrawn |
| A24 | 20background/foreground cycles | PASS | 20asserted manual-guide cycles; stress.jsonl |
| A25 | 20new navigation sessions | PASS | 20asserted manual journeys/exits; sessions.jsonl |
| A26 | Bounded native watcher ownership/cleanup | NOT RUN | Snapshots preserved; GMS aggregate does not prove app watcher counts |
| A27 | Native reroute and repeated reroutes | NOT RUN | Must execute final-binary off-route fixture |
| A28 | Three-button versus gesture controls | NOT RUN | Gesture baseline used; three-button variant pending |
| A29 | Small-screen/accessibility-service traversal | NOT RUN | 200%journey layout subset only; audible/manual acceptance external |
| A30 | Remaining native manifest/pointer/signature faults | NOT RUN | Source coverage is not native proof; lab trust disabled explicitly |
| A31 | Offline two-venue round trip | PASS | B50 synthetic Entrance/Hall; B57 Karachi return; premature tool swipes retried |
| A32 | Native attribution dialog opens | PASS | B48 MapLibre Android; no external link opened; legal content approval not inferred |
| A33 | Pan then recenter camera behavior | NOT RUN | Recenter touched; actual pan fixture not separately executed |
| A34 | Rapid permission/noisy duplicate/out-of-order native fixes | NOT RUN | Separate injected/source tests only |
| A35 | Long-duration performance/leak closure | NOT RUN | Measurements recorded; growth/plateau and attribution unresolved |

B-prefixed screenshots/XML, actual command exits and measured results live at `/Users/ghilmanislam360/.codex/visualizations/2026/11/02/01a19ab2-dc2e-7663-9270-d933f439f1b1/pc2-remediation/native/final`. Native source: delivered tarball, independently unpacked, no augmenting assets. Only tracked fixture coordinates were fed to real `emu geo fix` with the device adapter explicitly selected; demo adapter is labelled and isolated. Whole-guest network denied forA11–A22/A31. No physical acceptance inferred.

VIRT01/02selected-dark mismatch was not reproduced: actual Dark map/app/system bars observed onB. Font/display Activity reset was reproduced onA, corrected in70275f3, and journey retention verified onB. A07 is a new rendering observation with root cause still open, not an assertion that the two rejected diagnostic patches fix it. See ANDROID_FONT_SCALE_INVESTIGATION.md.

Only the recorded font/night/airplane/WiFi values were restored exactly. Cellular data was re-enabled; its original value had not been recorded. Emulator and task app stopped at checkpoint; unrelated iOS simulator left alone. Latest source/npm results are SOURCE/RUNTIME evidence, not substitutes for the NOT RUN native rows.


The historical A07 observation is resolved by085a493 and current-binary native measurements. Its old FAIL is retained above as history. A33 now passes on the current binary. Both task emulators/simulators are stopped at this checkpoint; Androidfont1.0/Systemappearance/English restored. Other guest network settings were not changed in this resumed Android campaign.
