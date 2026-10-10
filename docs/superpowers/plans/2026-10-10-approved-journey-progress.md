# SDD ledger — plan: docs/superpowers/plans/2026-10-10-approved-journey.md

Base canonical: 57529e305332c761358da51d18b8be292e5b7a7e.
Worktree: /Users/ghilmankhan/.codex/worktrees/journey-safety/offline-map.
Branch: codex/journey-safety. Issue: #307.

Pre-flight: Tasks 2/3 consume explicit startSource and live capability from Task1. Task4 uses existing translation infrastructure. Block2 source must remain separate. Directory/Sheet auto-start effects must be removed before hypothetical preview delivery.
Ruling: Split first safety stage into GPS quality PR A1 and authority/identity PR A2 — independently testable, keeps native adapter patch small. Subsequent approved UX stages remain required.
Ruling: Expo19 iOS exposes scope, not precision. Unknown cannot authorize live navigation; Android precision remains explicit. No new native dependencies added. iOS support requires a verified precision provider before live use.
Ruling: Open #355 overlaps LocationAccessService; keep its unrelated shell localization out of this patch, note overlap in PR.

Task1/A1: RED LocationCapability/Access 12 failures,33 passes; RED GPSManager/NavigationCapability 3 failures,34 passes.
Task1/A1: GREEN focused 4 suites,82 tests. Missing accuracy remains undefined; native coordinates retain original timestamps. Unknown precision and invalid values block capability. Permanently-denied requests do not reprompt.
Task1/A1: Initial whole Jest run 142 suites passed,2 failed;1366 tests passed,4 failed. All4 failures were existing positive-navigation fixtures omitting precise authorization. Explicit fine permission added; focused39 tests passed.
Task1/A1: npm ci installed lockfile dependencies without dependency changes. Existing peer/deprecation warnings and66 advisory findings (13 moderate,52 high,1 critical); no audit fix executed.
Task1/A1: typecheck passed; lint0 errors,2 existing warnings. npm test full script campaign passed. Final whole Jest rerun passed:144 suites,1370 tests,0 failures. Independent GPS patch review found no blocking flaws; optional fallback/watch/iOS coverage remains for later acceptance.
Remaining: readiness classification, final live activation guard, async journey identity; destination-firstMap; contextual recovery; explicit previews; Block2; manual upgrade preservation; localization/accessibility; full acceptance/CI/integration.

Task1/A1 integrated: PR #357 merged after green CI with exact head 7d72ca9e76ceee29f88e110391ba061dd5fe50dc. Canonical merge a711872cdefe490db1c0b105da381528a2bd706e.
Task1/A2 worktree /Users/ghilmankhan/.codex/worktrees/journey-authority/offline-map; branch codex/journey-authority; base a711872cdefe490db1c0b105da381528a2bd706e. Explicit readiness, final V2 command guard, location/route generation guards, destination reset, acquisition previews rather than deferred activation, explicit Settings recovery. Unusable GPS retains visible route preview.
Task1/A2 initial full component run failed17 assertions (6 suites),1368 passed. Updated approved auto-start/Settings contracts and explicit GPS fixtures; fixed retained-preview and missing-origin recovery regressions.
Task1/A2 independent review found outside guard comparing gate instead of composed origin and duplicate selections cancelling sole calculation. Regressions RED4 failures19 passes, then GREEN23 tests. Follow-up chooser regression RED1 failure10 passes; chooser preserves route, cancels acquisition, same selection dismisses picker; GREEN24 tests. Final independent source review found no remaining blockers.
Task1/A2 final checks: npm run typecheck passed; npm run lint passed0 errors2 existing warnings; npm test passed104 script commands including required routing suites; npm run test:components -- --runInBand passed145 suites1389 tests0 failures; git diff --check passed. Evidence /tmp/ijtema-authority-{components-approved,scripts-approved,typecheck,lint}.log. Automated only; no emulator/device/field run, no APK.
Remaining safety: permission/services refresh and invalid observations during active guidance; legacy activation boundary defense. Remaining UX: Directory destination handoff, no automatic sheet activation, explicit origin recovery, upgrade preservation, hypothetical Block2, localization/accessibility and UX-01..28 evidence.
Usage at this checkpoint:45% short-term44% weekly; daily/context percentage unavailable.
