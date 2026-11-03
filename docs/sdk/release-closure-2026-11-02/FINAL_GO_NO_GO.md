> **3 November 2026, usage-stop checkpoint:** Starting HEAD `7892855a2fc76efbd579709536e953dd22a88430`. Initial live five-hour usage was **90%** (weekly **54%**), triggering the owner's mandatory stop rule before native workloads. No emulator campaign, diagnostic APK, source correction or production rebuild was started. All five accepted artifact hashes freshly match; executable source remains equal to `21d1ed40dc652f54670d49d3075b13d4c3be796d`. Local/tracking/live starting HEAD equality verified.
>
> Matrices remain **Android 29 PASS / 0 FAIL / 4 BLOCKED / 2 NOT RUN (35)** and **iOS 13 PASS / 0 FAIL / 6 BLOCKED / 1 NOT RUN (20)**. No original row completed or promoted. Exact remaining original scenarios, expected fields and blocker classifications are under `usageStopCheckpoint20261103` in [NATIVE_RESUME_RESULTS.json](NATIVE_RESUME_RESULTS.json); iOS additional gates have no stable IDs, so original zero-based indices are retained.
>
> Software implementation/automated checks retain their historical SOURCE/RUNTIME VERIFIED PASS; engineering evidence closure remains incomplete. Full virtual acceptance, controlled pilot and unrestricted production remain **NO-GO**. Memory attribution remains **INCONCLUSIVE**. Simulator geometry root cause remains unconfirmed; iOS stress remains **16/20**, with protocol continuity required before combining later sessions. No new product defect established. No full source chain rerun for this documentation-only checkpoint.
>
> Next authorized execution: recheck actual usage and resources, independently confirm no overlapping PC1 source writer, then prioritize Android A27/A29 against verified Release; restore task-owned iOS simulator geometry and reopen the original Directory case; verify stress protocol; use a separate profileable consumer only for diagnostic ownership attribution. No automatic/background continuation, reset redemption or paid credits. Evidence: [FINAL_BLOCKER_EVIDENCE_MANIFEST.json](FINAL_BLOCKER_EVIDENCE_MANIFEST.json). The 2 November record below remains historical evidence.

# Native acceptance continuation — 2 November2026

EMULATOR VERIFIED where explicitly stated; bounded to owner one-hour cap from11:44:58UTC/16:44:58Karachi. Starting HEAD`a0f5cedc3fb7ff906b42fa0b0720be39edd66d06`; accepted source`21d1ed40dc652f54670d49d3075b13d4c3be796d`. No executable source fix, app rebuild, dependency/lock/GIS/legal/signing change. All five accepted hashes freshly match; delivery embeds exact SDK bytes. This report supersedes the preceding checkpoint totals, preserving its evidence.

| Platform | PASS | FAIL | BLOCKED | NOT RUN |
|---|---:|---:|---:|---:|
|Android35rows|29|0|4|2|
|iOS20groups|13|0|6|1|

All original case IDs/denominators retained. No automation failure was converted to an app FAIL. Detailed per-original-row steps, expected/actual results, native versus lab mechanism, OS, binary and raw evidence are in ANDROID_FINAL_MATRIX.json, IOS_FINAL_MATRIX.json and NATIVE_RESUME_RESULTS.json.

Android: real-filesystem lab10/10 and visible1080x2400 summary; fresh20Live sessions and20Home/foreground cycles; offline Karachi→synthetic→Karachi with old session/route/marker clearance and fresh return journey. One native off-route reroute independently captured; repeated sequence incomplete. OS test-provider weak input was accepted by the OS but not established end-to-end through GMS/Expo; weak/stale/noisy fault row remains blocked. Exact watcher ownership remains blocked: actual GPS request is1s during Live and OFF after Exit, but internal GMS/Expo/JS subscriptions/timers are not exposed. Actual TalkBack available/bound and SDK Search focus/keyboard activation observed; full traversal/modal/Arrival announcements unverified. Initial notification-modal-only traversal pass withdrawn. Existing200%Arrival/three-button/small-screen/RTL/appearance/pan/recenter/network-isolation proofs remain tied to the unchanged binary and are not rerun or inflated.

iOS: actual SpringBoard permission prompt touched Allow While Using App and native candidate appeared;45.265sPASS. Original12XCTest successes are retained without rerunning. Known system-wide banner returned(top93vs50; wrong display geometry), blocking Directory/layout setup; attempted DisplayZoom restoration and all hierarchy/setup failures retained. Functional lifecycle stress is separately labelled at actual measured geometry; no layout pass inferred. simctl location has no accuracy/time/CoreLocation-error injection; native stale/weak and exact watch restart/ownership still require a validated harness. Per-process scoped network denial is unavailable in the current harness; no host-wide firewall, global outage or unsafe production debug hook used. Existing real CoreLocation/synthetic/source evidence remain distinct.

Memory classification: **INCONCLUSIVE attribution; no confirmed leak and no leak fix.** Fresh5warmups+3baselines+10+10sessions+3final stabilization samples, same PID5413, normalExit and10s idle each; prior6sessions never combined. All counters/rawprocstats/location/activity/uptime/status/gfxinfo retained.

| Sample | PSSKiB | RSSKiB | PrivateDirtyKiB | SwapPSSKiB | NativePSSKiB | NativeallocatedKiB | JavaSummaryKiB |
|---|---:|---:|---:|---:|---:|---:|---:|
|baseline-2|121997|214896|75868|236|47955|54434|14124|
|block1-idle|161922|254208|113496|242|75375|82153|14388|
|block2-idle|140777|206680|83532|21327|50073|61548|13428|
|final-stabilization-2|140819|206772|83440|21323|50073|61545|13328|

Substantial natural reclamation: native allocated85829→41791KiB at block2sessions1→2. Views519–520, oneviewroot/Activity,5contexts/21assets stable; Binder count also recedes. Final totalPSS+SwapPSS162142KiB versus block1idle162164KiB. Rising swap means residentPSS alone is misleading. GraphicsPSS0 is emulator accounting, not zero graphics/MapLibre memory. Java heap dump denied Process not debuggable; corrected Perfetto stdin trace succeeds but heapprofd explicitly says process is not profileable; no allocation stacks/object-retention proof. Exact Hermes/JS, MapLibre caches, native allocator and graphics ownership remains unresolved. Separate post-protocol trim/GC probe retained; no forced trim mixed into controlled blocks. Smallest follow-up: separately hashed profileable diagnostic APK from21d1ed4 with symbols, comparable heapprofd snapshots/blocks and Hermes heap census. Deferred to honor onehour and independent native testing.

SOURCE/RUNTIME VERIFIED historical unchanged-source baseline:223Jest suites/2389tests;91506golden/2400differential comparisons;14security checks;63delivered consumer tests; both Metro exports; deterministic package; typecheck; lint0errors/2existingwarnings; npm test. Exact commands/log hashes remain ARRIVAL_COLUMN_VALIDATION.json. No full suite or unchanged production build repeated for documentation-only work. Fresh checks: source diff versus21d1ed4 excludingdocs, five artifact hashes/delivery containment, original matrix count/ID consistency and git diff --check. New XCTest/harness results do not change Jest totals.

iOS functional stress completed 16/20sessions in this bounded attempt; partial sessions never counted as a full-groupPASS.

Accepted identities(all freshly verified):

- sdkSha256:`a2bb865d38d457ea19228b81670616a57f353644dd05be1c2d16fafc738f71d4`
- deliverySha256:`87e17e33ea10be2ae40c4d1965159989cc5d492d1637263ce5e5ca62b98871e5`
- androidApkSha256:`40228465e6073b3c37d902f6870f54b0e26895327cb85026e0f4d2d9d7e87f90`
- iosExecutableSha256:`29962a589b6f0249417f5bf290aaf12efef06c729a81b65184f0c80429a8b32d`
- iosJsSha256:`ad88c6c7349e2d95eeecdb50f237beb7dd27f8d71cb3b84fc5315735fa6acf6c`

Engineering closure: **NO-GO/incomplete native and attribution evidence**. Virtual-device full acceptance: **NO-GO/partial**, original12case iOS milestone retained. Controlled pilot: **NO-GO**. Unrestricted production: **NO-GO**. No confirmed remaining product defect established by this continuation. These decisions do not erase historical verified fixes.

External gates unchanged: physical Android/iOSGPS walking and hardware/network behavior, whole-device airplane mode, human VoiceOver/TalkBack,89Urdu/RomanUrdu strings, venue redistribution rights, Gates18/19survey, independent security/native review, security-exception acceptance, signing authority and distribution approval.

Repository safety: one existing checkout; same SDK branch; all3stash identities, protected untracked.codex config, main and integrationbaseline preserved. No clone/worktree/branch or source writer created. Docs normally committed/pushed and local/tracking/live checked afterward; final documentationSHA is the commit containing this record and the linked issue checkpoint. No invisible continuation. Android task AVD stopped; guest remains scoped offline, TalkBack disabled/mock provider removed; network can be restored from original-guest-settings.json next boot. iOS task app/provider/simulator stopped at handoff; unrelated booted simulators untouched.

Evidence root:`/Users/ghilmanislam360/.codex/visualizations/2026/11/02/01a19c13-387a-73d3-9ae8-d9ecfc79b7d8/native-acceptance-20261102-1645`; native evidence hashes in NATIVE_RESUME_EVIDENCE_MANIFEST.json. Reproduction scripts/protocol/commands in that batch. Intermediate compiler outputs are excluded from the evidence manifest; all native logs/XML/PNG/trace/xcresult attachments and harness/protocol files included.

Fresh validation commands: `/usr/bin/python3 /private/tmp/sdk-close-native.py`; `git diff --quiet 21d1ed40dc652f54670d49d3075b13d4c3be796d -- :!docs`; `git diff --check`. Evidence manifest rehash: all3,846entries verified after native processes stopped.

## Verdicts as of 3 November 2026
1 Source/automated regression: unchanged (no source change since 21d1ed4). 2 Android emulator: PARTIAL (A27/A29 BLOCKED, A34 NOT RUN). 3 iOS simulator: PARTIAL (13 mini geometry BLOCKED; alternate smoke PASS only). 4 Memory attribution: INCONCLUSIVE. 5 Engineering evidence closure: NO-GO/incomplete. 6 Controlled pilot: NO-GO. 7 Unrestricted production: NO-GO. External gates unchanged and still BLOCKED.
