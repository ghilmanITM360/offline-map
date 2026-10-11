# UX-01–28 evidence reconciliation (Phase A)

Validated source: `c833814dec839f1cca249c25f760c232cd351b3d`, integrated as canonical `b36e1e4ba7eebacf89f6db4bccb237014da95ce3` through PR #369. Trees are identical. Executed component campaign: 157 suites / 1,556 tests PASS; `npm test`: 106 command headings PASS. Evidence references are repository-relative. Earlier matrix mapping was established on the Directory slice and all cited tests also ran in this later full campaign. [Exact-head CI](https://github.com/ghilmanITM360/offline-map/actions/runs/38129234889) passed.

PASS below means the cited automated behavior passed, not full native acceptance. Native/emulator/physical/field verification remains NOT VERIFIED for every row. Gate 18 and Gate 19 remain physically BLOCKED. This matrix maps actual executed assertions; it does not upgrade source evidence to native acceptance.

## UX-01 — Deep-scroll Block selection

Expected: Map opens with visible destination panel

Observed: Stable anchors, restoration and selection handoff pass independently. No executed deep-scroll gesture followed through to visible Map panel.

Evidence: `DirectoryScrollRestoration.test.ts:2; LocationsDirectoryScreen.test.tsx:159,527,560`. Category: automated source/JavaScript/component. Status: **NOT VERIFIED**. Runtime status: **NOT VERIFIED (native/emulator/physical/field)**.

## UX-02 — Filtered/search Block selection

Expected: No hidden location action

Observed: Filtered dataset, selection handoff and destination setup actions pass; no physical screen evidence.

Evidence: `LocationsDirectoryScreen.test.tsx:63,109,159; LocationSheetStartStates.test.tsx:86`. Category: automated source/JavaScript/component. Status: **PASS**. Runtime status: **NOT VERIFIED (native/emulator/physical/field)**.

## UX-03 — Gate/Rasta/Special Route selection

Expected: Same correct selection flow

Observed: Parameterized B1/GATE_08/R4/SHAHR_E_PINDAL_NORTH selections activate supported journeys once; categories enumerate correctly.

Evidence: `DestinationLiveIntent.test.tsx:45; LocationsDirectoryScreen.test.tsx:46`. Category: automated source/JavaScript/component. Status: **PASS**. Runtime status: **NOT VERIFIED (native/emulator/physical/field)**.

## UX-04 — No permission

Expected: Destination visible; choose start or location

Observed: Destination-only state asks for origin; service does not prompt without permission authorization.

Evidence: `DirectionsOriginTruth.test.tsx:45; LocationSheetStartStates.test.tsx:86; LocationAccessService.test.ts:74`. Category: automated source/JavaScript/component. Status: **PASS**. Runtime status: **NOT VERIFIED (native/emulator/physical/field)**.

## UX-05 — Permission denied

Expected: Manual Route Guide available

Observed: Denied permission prevents live guidance; explicit manual origin supports guide activation.

Evidence: `LocationCapability.test.ts:30,75; LocationSheetJourneyIntegration.test.tsx:39`. Category: automated source/JavaScript/component. Status: **PASS**. Runtime status: **NOT VERIFIED (native/emulator/physical/field)**.

## UX-06 — Permanently denied

Expected: Optional Settings recovery

Observed: Permanently denied permission never prompts; rendered Settings action and upgrade rollback preserve guide.

Evidence: `LocationAccessService.test.ts:347; LocationSheetJourneyIntegration.test.tsx:183,205`. Category: automated source/JavaScript/component. Status: **PASS**. Runtime status: **NOT VERIFIED (native/emulator/physical/field)**.

## UX-07 — Approximate only

Expected: No false live readiness

Observed: Approximate precision cannot authorize live navigation, progress or arrival.

Evidence: `LocationCapability.test.ts:39; ActiveLocationAuthority.test.tsx:18`. Category: automated source/JavaScript/component. Status: **PASS**. Runtime status: **NOT VERIFIED (native/emulator/physical/field)**.

## UX-08 — GPS unavailable

Expected: No fake location or active tracking

Observed: Services-off/timeout paths invent no live coordinate; remembered fallback remains non-live.

Evidence: `LocationAccessService.test.ts:110,196,246; DirectionsOriginTruth.test.tsx:45`. Category: automated source/JavaScript/component. Status: **PASS**. Runtime status: **NOT VERIFIED (native/emulator/physical/field)**.

## UX-09 — Fresh GPS

Expected: Fresh usable GPS plus new destination tap starts guarded automatic Live Navigation. Manual-to-live upgrade still requires confirmation, replacement preview and explicit Start. Supersedes historical explicit-Start expectation.

Observed: Fresh destination-selection intent activates once without permission prompt; stale/cancelled/replaced/failed intents cannot activate. Plain route mount still requires explicit action.

Evidence: `DestinationLiveIntent.test.tsx:45,60,66,77,110,147,172`. Category: automated source/JavaScript/component. Status: **PASS**. Runtime status: **NOT VERIFIED (native/emulator/physical/field)**.

## UX-10 — Manual FROM + TO

Expected: Preview then manual Route Guide

Observed: Explicit manual start previews first; explicit guide starts manual mode, not live navigation.

Evidence: `LocationSheetJourneyIntegration.test.tsx:39; DirectionsJourneyState.test.tsx:53`. Category: automated source/JavaScript/component. Status: **PASS**. Runtime status: **NOT VERIFIED (native/emulator/physical/field)**.

## UX-11 — Block 2 shortcut

Expected: Labelled hypothetical preview

Observed: Hypothetical preview does not write currentLocation or authorize guide/live movement; notice and confirmation render.

Evidence: `DirectionsBlock2Preview.test.tsx:19,56; LocationSheetBlock2Preview.test.tsx:22`. Category: automated source/JavaScript/component. Status: **PASS**. Runtime status: **NOT VERIFIED (native/emulator/physical/field)**.

## UX-12 — Confirm "I'm at Block 2"

Expected: Manual route only

Observed: Confirmation converts current-journey origin to manual; no GPS authority.

Evidence: `DirectionsBlock2Preview.test.tsx:30; LocationSheetBlock2Preview.test.tsx:22`. Category: automated source/JavaScript/component. Status: **PASS**. Runtime status: **NOT VERIFIED (native/emulator/physical/field)**.

## UX-13 — Block 2 → Block 2

Expected: SAME_PLACE

Observed: Block 2 same-place persists before/after confirmation; no navigation action.

Evidence: `DirectionsBlock2Preview.test.tsx:40`. Category: automated source/JavaScript/component. Status: **PASS**. Runtime status: **NOT VERIFIED (native/emulator/physical/field)**.

## UX-14 — Destination changed

Expected: Previous journey cannot auto-activate

Observed: Destination replacement retires late auto-start/chooser results, including same-destination generation.

Evidence: `DestinationLiveIntent.test.tsx:77,147; DirectoryChoiceOwnership.test.ts:13,38`. Category: automated source/JavaScript/component. Status: **PASS**. Runtime status: **NOT VERIFIED (native/emulator/physical/field)**.

## UX-15 — Cancel during GPS request

Expected: No late destination/navigation

Observed: Chooser cancellation and preview invalidate late permission/fix; no journey mutation.

Evidence: `DirectionsJourneyAuthority.test.tsx:101,134; DirectionsBlock2Preview.test.tsx:92`. Category: automated source/JavaScript/component. Status: **PASS**. Runtime status: **NOT VERIFIED (native/emulator/physical/field)**.

## UX-16 — Invalid/NaN/negative accuracy

Expected: Rejected

Observed: Nonfinite/negative accuracy and invalid geography rejected.

Evidence: `LocationCapability.test.ts:95,98; LocationNavigationCapability.test.ts:118`. Category: automated source/JavaScript/component. Status: **PASS**. Runtime status: **NOT VERIFIED (native/emulator/physical/field)**.

## UX-17 — Unknown precision

Expected: Not LIVE_READY

Observed: Missing native precision remains unknown and cannot authorize live mode.

Evidence: `LocationCapability.test.ts:68; LocationAccessService.test.ts:343`. Category: automated source/JavaScript/component. Status: **PASS**. Runtime status: **NOT VERIFIED (native/emulator/physical/field)**.

## UX-18 — Manual guide → GPS

Expected: New route preview before live Start

Observed: Confirmation, private replacement preview and explicit Start tested; cancellation/failure retain original route/origin/step.

Evidence: `DirectionsManualLiveUpgrade.test.tsx:24,37,58,106,151,174; LocationSheetJourneyIntegration.test.tsx:109`. Category: automated source/JavaScript/component. Status: **PASS**. Runtime status: **NOT VERIFIED (native/emulator/physical/field)**.

## UX-19 — Outside direct guide

Expected: Honest gate-direction presentation

Observed: Outside direct guide labels direct distance, suppresses walking ETA and uses confirmed Exit.

Evidence: `DirectionsJourneyState.test.tsx:61; LocationSheetStartStates.test.tsx:145,157,163; NavigationChromeV2.test.tsx:315,434`. Category: automated source/JavaScript/component. Status: **PASS**. Runtime status: **NOT VERIFIED (native/emulator/physical/field)**.

## UX-20 — Route calculation failure

Expected: Clear error; no dead Start

Observed: Route failure has no startable action; recovery controls render; no fabricated preview.

Evidence: `DirectionsJourneyState.test.tsx:101; LocationSheetStartStates.test.tsx:68; DirectionsBlock2Preview.test.tsx:83`. Category: automated source/JavaScript/component. Status: **PASS**. Runtime status: **NOT VERIFIED (native/emulator/physical/field)**.

## UX-21 — FULL → PARTIAL → PEEK

Expected: Panel remains reachable

Observed: PEEK control expands, persists and meets touch target in component tests. Full native FULL/PARTIAL/PEEK drag sequence not executed.

Evidence: `DirectionsPeekHandle.test.tsx:17,27,36; LocationSheetDirectionsRedesign.test.tsx:286`. Category: automated source/JavaScript/component. Status: **NOT VERIFIED**. Runtime status: **NOT VERIFIED (native/emulator/physical/field)**.

## UX-22 — Live navigation begins

Expected: Setup panel replaced by live controls

Observed: Active chrome directions follow reroute and preserve instruction geography; setup/search visibility ownership asserted. Native transition not executed.

Evidence: `NavigationChromeV2.test.tsx:617,630; HomeSearchChromeHiddenDuringNavigation.test.ts; LocationSheetJourneyIntegration.test.tsx:109`. Category: automated source/JavaScript/component. Status: **PASS**. Runtime status: **NOT VERIFIED (native/emulator/physical/field)**.

## UX-23 — Arrival

Expected: Proper arrival then Directory

Observed: Arrival card Done/back completes; Directory becomes sole stack route and next trip opens fresh Map.

Evidence: `NavigationChromeV2.test.tsx:493,519,531,540; PostArrivalStack.test.tsx:67,76`. Category: automated source/JavaScript/component. Status: **PASS**. Runtime status: **NOT VERIFIED (native/emulator/physical/field)**.

## UX-24 — Process death/recovery

Expected: Fresh journey; no auto-resume

Observed: Hydration leaves navigation idle and installs no watcher; recovery consumes destination into normal fresh flow.

Evidence: `UnfinishedJourneyMarker.test.ts:205,219,230,266; useAppStoreProcessDeath.test.ts`. Category: automated source/JavaScript/component. Status: **PASS**. Runtime status: **NOT VERIFIED (native/emulator/physical/field)**.

## UX-25 — Airplane mode

Expected: Core map and Route Guide remain functional

Observed: Bundled basemap provenance/source checks pass. Airplane-mode map rendering and manual guide not executed on native runtime.

Evidence: `scripts/test-offline-v2.ts:50; scripts/test-offline-rendering.ts:10; scripts/test-offline-basemap.ts`. Category: automated source/JavaScript/component. Status: **NOT VERIFIED**. Runtime status: **NOT VERIFIED (native/emulator/physical/field)**.

## UX-26 — 320dp and 200% font

Expected: All essential controls reachable

Observed: Wrapping/footer/touch-target properties pass under mocked components. Actual 320dp/200% layout and control reachability unexecuted.

Evidence: `LocationsDirectoryScreen.test.tsx:89,102,203,210; LocationSheetDirectionsRedesign.test.tsx:170,275`. Category: automated source/JavaScript/component. Status: **NOT VERIFIED**. Runtime status: **NOT VERIFIED (native/emulator/physical/field)**.

## UX-27 — Urdu RTL/Roman Urdu/English

Expected: Correct flow and readable labels

Observed: Directory translations, Roman search and locale switching pass; whole-journey localization incomplete. No native Urdu review or audible TalkBack.

Evidence: `DirectoryLocalization.test.tsx:13,21,37,53; NavigationChromeV2.test.tsx:630`. Category: automated source/JavaScript/component. Status: **NOT VERIFIED**. Runtime status: **NOT VERIFIED (native/emulator/physical/field)**.

## UX-28 — Multiple consecutive journeys

Expected: No source or callback leakage

Observed: Cancelled/reopened/same-destination chooser results rejected; duplicate taps once; retained Cancel harmless; consecutive candidate commands retired.

Evidence: `DirectoryChoiceOwnership.test.ts:13,22,30,44,62; LocationsDirectoryScreen.test.tsx:574,590,601; DirectionsManualLiveUpgrade.test.tsx:239`. Category: automated source/JavaScript/component. Status: **PASS**. Runtime status: **NOT VERIFIED (native/emulator/physical/field)**.

## Remaining evidence gaps

- UX-01 needs actual deep-scroll selection and visible destination-panel observation in one executed flow. Stable anchor unit tests alone do not prove that gesture.
- UX-21 needs native snap/drag/reopen sequence; current component tests prove button behavior.
- UX-25 needs airplane-mode native rendering and manual-route exercise, not source provenance alone.
- UX-26 needs native 320dp and 200% font screenshots/control traversal.
- UX-27 needs whole-journey translation completion, native Urdu review, mixed-script rendering and audible TalkBack. Directory slice cannot establish whole journey.
- Existing explicit-Start tests without destination-selection intent are valid fallback coverage; do not mistake their names for superseded UX-09 policy. `DestinationLiveIntent.test.tsx:45` is fast-path authority evidence.
