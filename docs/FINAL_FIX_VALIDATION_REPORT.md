# Final Fix Validation Report

Fix pass following `docs/CURRENT_FIX_PLAN.md`, itself following the findings in `docs/FINAL_NAVIGATION_PRODUCTION_READINESS_REPORT.md`. No architecture rewrite, no routing algorithm rewrite — every change below is a targeted fix.

## Fixed Issues

| # | Issue | Fix |
|---|---|---|
| 1 | Filter-chip → marker-visibility unreliable | Force remount of the four filterable overlay layers on `activeMapFilter` change (`key={`v2_layers_${activeMapFilter}`}`) so a filter switch can't leave stale native Marker/Polygon views behind, regardless of root platform cause. |
| 2 | Gate marker label collisions | Greedy proximity declutter in `getHomeLayers` — colliding lower-priority gate labels render as a plain dot instead of clipped text. Every gate stays visible as a marker; only the label text is suppressed. |
| 3 | Layers control was a native `Alert.alert` | New `LayersSheet.tsx` bottom sheet: Standard/Satellite segmented control + independent Blocks/Gates/Rastas/Pindal toggles, large touch targets, safe-area aware. |
| 4 | Route preview card buried the recommended gate in prose | Added a distinct "Enter through Gate NN" badge row, separate from the route summary sentence. |
| 5 | Outside routing could discard a valid connected gate to full beeline | `selectOutsidePathViaStreetGraph` now pre-filters candidate gates by internal-graph connectivity before the street-graph search, so a disconnected gate (e.g. `GATE_03`) can never "win" the search in the first place — the next-best connected gate gets a real street-following path instead of a full beeline fallback. |
| 6 | Map layer components not memoized | `BlockLayer`, `GateLayer`, `RastaLayer`, `SpecialRouteLayer` wrapped in `React.memo` — GPS-driven re-renders no longer cascade through all four when their own props are unchanged. |

## Root Causes

- **Filter-chip bug**: re-audited `V2MapRenderingService.getHomeLayers` line by line — the filter math was already correct (confirmed again this session: `mapFilter === 'gates'` deterministically produces `blocks: []`/`visibleBlockLabels: []`). No JS logic bug found. The prior session reproduced the symptom on both a stale and a freshly-cleared Metro bundle, and this session's own emulator interaction hit severe host memory exhaustion (`PhysMem: 15G used, 85M unused`, load average 30-55 sustained) causing the Android system itself to ANR — strong circumstantial evidence the original symptom was a react-native-maps/Android rendering artifact under resource pressure, not a state bug. The remount-key fix removes any ambiguity from React's side of the diff regardless.
- **Gate label collisions**: `GateLayer`'s zoom-tier label shortening reduced text width but had no notion of on-screen distance between pins — no collision detection existed at all.
- **Outside routing gate discard**: `selectOutsidePathViaStreetGraph`'s candidate filter checked `routingStatus`/`canStartRouteFromOutside` but not internal-graph connectivity, unlike the beeline path's `resolveOutsideGateSeeds` which already had that check. The mismatch meant only the street-graph path could pick a physically-reachable-but-internally-disconnected gate and then discard its own result.

## Files Changed

- `src/services/RoutingServiceV2.ts` — connectivity pre-filter for outside street-graph candidate gates.
- `src/services/V2MapRenderingService.ts` — gate label declutter (`declutterGateMarkers`), independent overlay-toggle options (`showGatesLayer`/`showRastasLayer`/`showSpecialRoutesLayer`).
- `src/views/components/map/GateLayer.tsx` — dot-only render path for label-suppressed gates; `React.memo`.
- `src/views/components/map/BlockLayer.tsx`, `RastaLayer.tsx`, `SpecialRouteLayer.tsx` — `React.memo`.
- `src/views/components/map/mapLayerStyles.ts` — `v2GateMarkerDot` style.
- `src/views/components/map/LayersSheet.tsx` — new component.
- `src/views/screens/HomeScreen.tsx` — remount-key on filterable layers, Layers sheet wiring, route preview gate badge, new store toggles.
- `src/store/useAppStore.ts` — `showGatesLayer`/`showRastasLayer`/`showSpecialRoutesLayer` persisted booleans.
- `scripts/test-home-ux.ts`, `scripts/test-offline-rendering.ts` — updated source-marker assertions to match the new Layers-sheet implementation (both previously asserted literal strings that only existed in the old `Alert.alert` call).
- `docs/CURRENT_FIX_PLAN.md` — new, pre-fix root-cause/strategy doc.

## Tests Passed

- `npm run typecheck` — clean.
- `npm run lint` — clean (one pre-existing unrelated warning in a skill script, untouched).
- `npm test` — full 70+ script suite, **all passing**, including every v2 map-data/routing/rendering script relevant to these changes (`gate-marker-rendering-v2` — 42/42, including "no clipping artifact" and the previously-failing "all 17 gate markers visible" case now passing with the dot-suppression fix; `home-filter-chips-v2`, `map-filter-rendering-v2`, `outside-street-routing-v2`, `outside-street-graph-integration-v2`, `nearest-gate-selection-v2`, `route-preview-v2`, `home-ui-route-preview-v2`, `routing` — 552/552 block pairs, `map-data-v2`, `navigation-graph-v2`, `entry-gate-routing`, `route-smoke-v2`, `production-v2-defaults`, `offline-v2`, `v1-v2-isolation`, `performance-v2`, `storage-v2`, `marker-performance-v2`).
- Two script assertions (`test-home-ux.ts`, `test-offline-rendering.ts`) had to be updated because they string-matched the old `Alert.alert` implementation directly — updated to check the new `LayersSheet.tsx` component and the wiring in `HomeScreen.tsx` instead; behavior they guard (a working layer chooser, an offline satellite warning) is preserved and improved, not weakened.

## Screenshots / Live Emulator Evidence

**Honest gap, not a scope choice.** The host machine was under severe resource exhaustion this session (`PhysMem: 15G used, 85M unused`, `5897M` in the memory compressor, sustained load average 30-55 across multiple checks) — worse than the prior session's already-flagged contention. Every `adb` interaction attempted either took 60-90+ seconds or hung outright:
- App launch succeeded but Android itself threw a system-level ANR ("Process system isn't responding") — captured as `01-launch.png` in the scratch screenshots directory. This is a host-capacity failure, not an app crash — the dialog is Android's own system UI, not the Karachi Ijtema app.
- A follow-up tap-to-wait and a `force-stop` command both hit the 60-90s tool timeout with no response.

I did not fabricate or infer additional screenshots. **No PASS claim below is based on live device interaction** — only on the script suite, which does directly assert on the rendered output of `getHomeLayers`, `GateLayer`, and the route-preview data shape (not a full UI screenshot, but a real assertion against the actual component logic, not a mock).

## Remaining Work / Risks

1. **Live emulator/device QA for this fix pass is still outstanding** — needs a host with available memory headroom (this session's host had ~85MB free physical memory) or a physical device. Specifically unverified live: filter-chip A/B toggle behavior post-remount-fix, gate-cluster dot-suppression visual result, the new Layers bottom sheet's actual on-screen usability, the route preview gate badge's appearance.
2. The filter-chip fix (remount key) is a defensive mitigation for a symptom whose exact platform-level root cause was never conclusively isolated (see Root Causes above) — if it recurs on a healthy device, the next step is a React DevTools session specifically watching for native marker leak vs. a still-undiscovered JS cause.
3. Per the audit's prior "Remaining Work" list, still explicitly not touched this pass (per instruction — no architecture rewrite): unifying `RoutingServiceV2.selectOutsidePath` and `EntryGateRoutingService.findBestGateForOutsideUser` into one implementation; the uncaptured console warning from the prior session; the leaked Google Maps API key rotation; committing the working tree.
4. The Layers sheet's overlay toggles (`showGatesLayer`/`showRastasLayer`/`showSpecialRoutesLayer`) are new persisted state — first app launch after this update will default them all to `true`, so existing users see no behavior change until they open the new sheet.
