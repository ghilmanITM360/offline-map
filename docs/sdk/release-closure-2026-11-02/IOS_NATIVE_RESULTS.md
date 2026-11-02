## Native continuation — 2 November2026

iOS continuation current counts:{'PASS': 13, 'FAIL': 0, 'BLOCKED': 6, 'NOT RUN': 1}. See FINAL_ENGINEERING_STATUS.md and NATIVE_RESUME_RESULTS.json for current evidence/boundaries. Previous checkpoint preserved below.

# Final iOS simulator checkpoint

EMULATOR VERIFIED: final executable`29962a589b6f0249417f5bf290aaf12efef06c729a81b65184f0c80429a8b32d`, JS`ad88c6c7349e2d95eeecdb50f237beb7dd27f8d71cb3b84fc5315735fa6acf6c`. **12/12 native XCTest acceptance cases PASS**; setup/failed harness attempts are separate. Expanded20-group matrix: **12PASS/0FAIL/4BLOCKED/4NOT RUN**. This is a new breakdown; historical14-case and earlier-binary results are not added.

- test04UrduExtraLarge: PASSED; `/Users/ghilmanislam360/.codex/visualizations/2026/11/02/01a19ab2-dc2e-7663-9270-d933f439f1b1/pc2-remediation/native/closure-final-ios-20261102-02/campaign-1793615472.log`
- test05UrduAX5: PASSED; `/Users/ghilmanislam360/.codex/visualizations/2026/11/02/01a19ab2-dc2e-7663-9270-d933f439f1b1/pc2-remediation/native/closure-final-ios-20261102-02/campaign-1793615472.log`
- test01Normal: PASSED; `/Users/ghilmanislam360/.codex/visualizations/2026/11/02/01a19ab2-dc2e-7663-9270-d933f439f1b1/pc2-remediation/native/closure-final-ios-20261102-02/campaign-1793615710.log`
- test02ExtraLarge: PASSED; `/Users/ghilmanislam360/.codex/visualizations/2026/11/02/01a19ab2-dc2e-7663-9270-d933f439f1b1/pc2-remediation/native/closure-final-ios-20261102-02/campaign-1793615710.log`
- test03AX5: PASSED; `/Users/ghilmanislam360/.codex/visualizations/2026/11/02/01a19ab2-dc2e-7663-9270-d933f439f1b1/pc2-remediation/native/closure-final-ios-20261102-02/campaign-1793615710.log`
- test06UrduDynamicType: PASSED; `/Users/ghilmanislam360/.codex/visualizations/2026/11/02/01a19ab2-dc2e-7663-9270-d933f439f1b1/pc2-remediation/native/closure-final-ios-20261102-02/campaign-1793615710.log`
- test07NativeRecoveryReroute: PASSED; `/Users/ghilmanislam360/.codex/visualizations/2026/11/02/01a19ab2-dc2e-7663-9270-d933f439f1b1/pc2-remediation/native/closure-final-ios-20261102-02/campaign-1793615710.log`
- test08NativePackLab: PASSED; `/Users/ghilmanislam360/.codex/visualizations/2026/11/02/01a19ab2-dc2e-7663-9270-d933f439f1b1/pc2-remediation/native/closure-final-ios-20261102-02/campaign-1793615710.log`
- test09PermissionDenialRecovery: PASSED; `/Users/ghilmanislam360/.codex/visualizations/2026/11/02/01a19ab2-dc2e-7663-9270-d933f439f1b1/pc2-remediation/native/closure-final-ios-20261102-02/campaign-1793615710.log`
- test10NativeAsyncCancellationReplacement: PASSED; `/Users/ghilmanislam360/.codex/visualizations/2026/11/02/01a19ab2-dc2e-7663-9270-d933f439f1b1/pc2-remediation/native/closure-final-ios-20261102-02/campaign-1793615710.log`
- test11ReducedAccuracyRecovery: PASSED; `/Users/ghilmanislam360/.codex/visualizations/2026/11/02/01a19ab2-dc2e-7663-9270-d933f439f1b1/pc2-remediation/native/closure-final-ios-20261102-02/campaign-1793615710.log`
- test12NativeAccessibilityAudit: PASSED; `/Users/ghilmanislam360/.codex/visualizations/2026/11/02/01a19ab2-dc2e-7663-9270-d933f439f1b1/pc2-remediation/native/closure-final-ios-20261102-02/campaign-1793615710.log`

- Native transient CoreLocation error/backoff/duplicate watcher proof: BLOCKED.
- Native stale/weak-fix controlled fault variants: NOT RUN.
- Failed reroute recovery fault: BLOCKED.
- Verified scoped iOS network denial/offline cold-warm campaign: BLOCKED.
- Urdu Directory DynamicType variant and all manual endpoint-disabled variants: NOT RUN.
- Actual OS location-prompt touch variant (TCC commands used): NOT RUN.
- Remaining pack trust/manifest/pointer variants beyond shipped lab: BLOCKED.
- Long native iOS stress campaign: NOT RUN.

Five Arrival configurations use measured375x812 window, top50/bottom34 safe bounds, full card/scroll/button geometry, native swipe and coordinate Recenter/Done touches, actual exit and another journey. English Large/XL/AX5 and UrduXL/AX5 pass. Urdu step2 survives seven text transitions and unrelated theme commits; controls remain responsive. Real CoreLocation fixture111→91m→correct Gate02 arrival, loss/recovery, native off-route reroute, lifecycle return, TCC denial/recovery, reduced accuracy/recovery and cancellation/replacement pass. Native filesystem lab10/10 and XCTest `.all` accessibility audit pass. These do not certify physical GPS, VoiceOver or a full Accessibility Inspector human review.

System-wide rdar45025538 wrong dimensions were resolved by recorded DisplayZoom toggle/restoration, without changing app/frameworks. TCC authorization and PreciseLocation are separate: grant alone does not restore precision. The final harness uses measured-row coordinate touches and teardown restoration. Final Large/English/System restored, location simulation cleared and only task simulator shut down; unrelated simulator untouched.
