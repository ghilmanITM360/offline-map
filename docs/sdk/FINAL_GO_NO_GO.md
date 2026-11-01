# Final GO / NO-GO — SDK 0.1.0 release closure

Updated 1 November 2026, release-closure issue #393. Completed final delivery identities, exact results and preserved evidence are tracked in [the closure checkpoint](release-closure-2026-11-01/README.md). Exact source and artifact identities are in the final delivery manifest and attached QA handoff. This author-side report is not independent acceptance of Codex-authored corrections.

The subsequent [focused reviewer record](release-closure-2026-11-01/focused-review/README.md) freshly confirms both delivered Metro exports, 63 consumer tests, 222 component suites / 2,367 tests, security-disposition reconciliation and byte-reproducible SDK packs. No new defect was found. The reviewer ran in a fresh context within the same Codex chat; organizationally external/security acceptance and the release boundaries below remain pending.

## Software gates

| Gate | Engineering evidence | Remaining acceptance |
| --- | --- | --- |
| DELIV-01 | Fixed at `91de2d15728c4a8fae1f39827a55856a6935b04a`: actual archive ships all12 pinned packfiles, checks resources/checksums/metadata. Clean consumer63tests/types and both real production Metro exports passed. | Independent acceptance of packaging correction and final delivered graph. |
| SUP-01 | PostCSS 8.5.32 / Metro 0.83.8 overrides address six advisory sources; actual-Metro hostile-image and PostCSS canary/API probes pass. Root fresh audit0critical/0high; remaining low/moderate sources have a complete disposition. No Expo/RN/MapLibre or SDK runtime upgrade. | Final delivered-lock audit and both standalone exports completed at `1a913b9`; focused independent/security acceptance of conditional tooling exceptions remains pending. |
| REG-01 | Original two suites57/57 tests pass3runs. Full regression after both selected fixes:222/222suites,2367/2367tests. No test/product/timeout change. | Focused independent review of completed raw evidence. Host-pressure causation remains unproven. |
| Final source integration | Application/scripts typecheckPASS, ESLint0errors2pre-existingwarnings, full npmtestPASS,2400differential comparisons,91506golden route pairs unchanged,83headless/8exports checks, compiled package/runtime/declarations and byte reproducibilityPASS. | Final delivered-consumer checks passed; identities and raw-evidence references are tracked in the closure checkpoint. Independent acceptance remains pending. |

The original independent audit's16 SOURCE/RUNTIME PASS findings at `923a604be161c749bd5bf50d8fdd8c036ba4bcbb` remain preserved. No routing, navigation lifecycle, pack trust, API, Karachi graph/places/gates, PMTiles, native source or golden change occurred in release closure. Do not describe engineering checks as emulator/device/field acceptance.

## Verdict boundaries

**Controlled pilot / client integration: NOT CLEARED until focused independent acceptance of the final delivery and security disposition.** Implementation evidence may support conditional readiness; it does not authorize distribution. The final attached report records whether all software commands completed successfully.

**Unrestricted production: NO-GO.** Required external gates remain:

1. Physical iOS/Android walking and continuous physical-iPhone Live GPS.
2. Whole-device airplane-mode cold start.
3. Audible VoiceOver/TalkBack and remaining physical J01–J18.
4. Native-reviewed Urdu/Roman Urdu production wording.
5. Venue data redistribution rights and supported Gate18/19 surveyed connectivity (unchanged/unconnected).
6. Independent/external security acceptance and native-library review.
7. Owner-controlled production signing and authorized distribution.

Imported/remote packs remain refused: no trusted signing scheme/keys were fabricated. No external package publication/distribution occurred.

## Native evidence boundary

[Security/validation report](client/SECURITY_AND_VALIDATION_REPORT.md) records full artifact identities. APK A `e59518b9…` predates the arrival inset fix; APK B `bdfe5c92…` is corrected. Historical Android18PASS/2BLOCKED spans A plus targeted B checks, not18reruns onB. Earlier iOS executable identity `18933dab…` belongs to `4f9a4d2` / SDK `eab28df2…`, not final d722. No unchanged native application was rebuilt for release packaging/tooling.

Known product limits remain: host retains navigation authority; no sample street router or speech; Android live font-size change recreates the activity; untranslated strings remain English. See release notes and compatibility matrix.
