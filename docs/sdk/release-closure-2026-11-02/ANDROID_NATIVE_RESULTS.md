# Final Android checkpoint — corrected APK

EMULATOR VERIFIED. Source21d1ed40dc652f54670d49d3075b13d4c3be796d; APK`40228465e6073b3c37d902f6870f54b0e26895327cb85026e0f4d2d9d7e87f90`. Final35rows: {'PASS': 25, 'NOT RUN': 7, 'BLOCKED': 3}. Historical12PASS/23NOTRUN on d071437 and earlier25PASS are not inherited.

| ID | Scenario | Status | Actual result |
|---|---|---|---|
| A01 | Release build/install/cold launch | PASS | Guide step2 retained through actual font100→200, Previous/Next, Dark/Light/System and Urdu/Roman/English; screenshots/native frame bounds |
| A02 | Karachi offline startup/map | PASS | Guide step2 retained through actual font100→200, Previous/Next, Dark/Light/System and Urdu/Roman/English; screenshots/native frame bounds |
| A03 | Offline directory/search selection | PASS | Guide step2 retained through actual font100→200, Previous/Next, Dark/Light/System and Urdu/Roman/English; screenshots/native frame bounds |
| A04 | Manual origin and111m preview | PASS | Guide step2 retained through actual font100→200, Previous/Next, Dark/Light/System and Urdu/Roman/English; screenshots/native frame bounds |
| A05 | Manual Next/Previous/Recenter | PASS | Guide step2 retained through actual font100→200, Previous/Next, Dark/Light/System and Urdu/Roman/English; screenshots/native frame bounds |
| A06 | Journey retained through font-setting changes | PASS | Guide step2 retained through actual font100→200, Previous/Next, Dark/Light/System and Urdu/Roman/English; screenshots/native frame bounds |
| A07 | Existing text enlarges dynamically | PASS | Guide step2 retained through actual font100→200, Previous/Next, Dark/Light/System and Urdu/Roman/English; screenshots/native frame bounds |
| A08 | Dark map and system bars | PASS | Guide step2 retained through actual font100→200, Previous/Next, Dark/Light/System and Urdu/Roman/English; screenshots/native frame bounds |
| A09 | Light/System appearance transitions | PASS | Guide step2 retained through actual font100→200, Previous/Next, Dark/Light/System and Urdu/Roman/English; screenshots/native frame bounds |
| A10 | Urdu/Roman Urdu/English journey retention | PASS | Guide step2 retained through actual font100→200, Previous/Next, Dark/Light/System and Urdu/Roman/English; screenshots/native frame bounds |
| A11 | Effective offline cold/warm launch | PASS | Guest default-network/routing/IP/DNS probes saved; cold/warm/manual actual final APK |
| A12 | Offline manual route/guide | PASS | Guest default-network/routing/IP/DNS probes saved; cold/warm/manual actual final APK |
| A13 | Real filesystem pack lifecycle lab | NOT RUN | Pack result retrieval failed after display-profile restoration error; no complete final-APK10/10 accepted. Earlier binary result not inherited. |
| A14 | Native permission denial | PASS | Real Android permission prompt denied; manual fallback observed |
| A15 | Native approximate permission rejected | PASS | Actual coarse-only Android grants; precise blocker captured |
| A16 | Precise GPS candidate acquisition | PASS | Native emulator GPS acquisition, candidate cancel/reacquire, explicit Live, movement, loss/recovery, correct-destination Arrival, coordinate Recenter/Done and exit |
| A17 | Candidate cancellation/reacquisition | PASS | Native emulator GPS acquisition, candidate cancel/reacquire, explicit Live, movement, loss/recovery, correct-destination Arrival, coordinate Recenter/Done and exit |
| A18 | Explicit native Live confirmation | PASS | Native emulator GPS acquisition, candidate cancel/reacquire, explicit Live, movement, loss/recovery, correct-destination Arrival, coordinate Recenter/Done and exit |
| A19 | Native provider movement | PASS | Native emulator GPS acquisition, candidate cancel/reacquire, explicit Live, movement, loss/recovery, correct-destination Arrival, coordinate Recenter/Done and exit |
| A20 | Native lost signal and recovery | PASS | Native emulator GPS acquisition, candidate cancel/reacquire, explicit Live, movement, loss/recovery, correct-destination Arrival, coordinate Recenter/Done and exit |
| A21 | Offline native Arrival | PASS | Native emulator GPS acquisition, candidate cancel/reacquire, explicit Live, movement, loss/recovery, correct-destination Arrival, coordinate Recenter/Done and exit |
| A22 | Arrival Recenter/Done touch and exit | PASS | Native emulator GPS acquisition, candidate cancel/reacquire, explicit Live, movement, loss/recovery, correct-destination Arrival, coordinate Recenter/Done and exit |
| A23 | True200% Arrival touch clearance | PASS | Real Settings font2.0, enlarged Arrival inspected, actual Recenter/Done touches and exit |
| A24 | 20background/foreground cycles | NOT RUN | Six measured Live/lifecycle sessions complete; required20 not complete at usage checkpoint. |
| A25 | 20new navigation sessions | NOT RUN | Six measured Live/lifecycle sessions complete; required20 not complete at usage checkpoint. |
| A26 | Bounded native watcher ownership/cleanup | BLOCKED | Exit/late-fix behavior passes; exact watcher/subscription ownership not observable in unchanged Release. |
| A27 | Native reroute and repeated reroutes | NOT RUN | One native off-route reroute PASS; repeated-reroute variant not executed. |
| A28 | Three-button versus gesture controls | PASS | Three-button normal guide, 360x640dp small-screen controls, actual Next/Previous/Exit; accessibility-service proof separate |
| A29 | Small-screen/accessibility-service traversal | NOT RUN | 360x640dp controls PASS; installed TalkBack service traversal not executed. |
| A30 | Remaining native manifest/pointer/signature faults | BLOCKED | Remaining trust/pointer/manifest fault controls absent from shipped lab; signature-required imports not certified. |
| A31 | Offline two-venue round trip | NOT RUN | Final-APK two-venue round trip not executed before usage stop. |
| A32 | Native attribution dialog opens | PASS | Native pan/recenter and attribution dialog |
| A33 | Pan then recenter camera behavior | PASS | Native pan/recenter and attribution dialog |
| A34 | Rapid permission/noisy duplicate/out-of-order native fixes | NOT RUN | OS test-provider supports time/accuracy injection, but this batch was not started before usage threshold. |
| A35 | Long-duration performance/leak closure | BLOCKED | Memory INCONCLUSIVE: two comparable blocks not completed, no retained-object evidence. |

Per-row expected/observed/mechanism/binary/time-trace/evidence are in ANDROID_FINAL_MATRIX.json. Raw XML/PNG and every command: `/Users/ghilmanislam360/.codex/visualizations/2026/11/02/01a19ab2-dc2e-7663-9270-d933f439f1b1/pc2-remediation/native/closure-android-20261102-02`. Native candidate confirmation is awaited before movement; premature movement correctly triggered route-outdated in superseded automation. Small-screen reset initially removed an existing1080x2400 override; it was restored before warm memory sampling. These are harness errors, not product defects. Guest display/font/network state was restored from the first batch, task emulator stopped. Human TalkBack remains external.
