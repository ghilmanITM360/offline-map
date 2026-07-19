# Current Fix Plan

Fix plan for the issues verified live in `docs/FINAL_NAVIGATION_PRODUCTION_READINESS_REPORT.md`. No architecture rewrite, no routing algorithm rewrite — targeted fixes only, per instruction.

## 1. Filter-chip → marker-visibility unreliable

- **File**: `src/services/V2MapRenderingService.ts` (`getHomeLayers`), `src/views/screens/HomeScreen.tsx` (render of `BlockLayer`/`GateLayer`/`RastaLayer`/`SpecialRouteLayer`).
- **Root cause**: re-read `getHomeLayers` line by line this session — the filter math (`showBlocks`/`showGates`/`showRastas`/`showSpecialRoutes`, `visibleBlocks`/`visibleGateMarkers`/etc.) is correct: selecting `gates` produces `blocks: []` and `visibleBlockLabels: []` deterministically. `useMemo` deps include `activeCategory`. No stale closure, no id mismatch, no duplicate render path (all re-confirmed). The prior session reproduced the bug on both a stale and a freshly-cleared Metro bundle, which rules out a JS logic bug — it correlates instead with the emulator's own boot warning ("Software GL rendering will be used due to system memory pressure") and severe host resource contention observed later in that session. Most likely explanation: react-native-maps/AIRGoogleMap on Android occasionally lags removing Marker/Polygon native views when many children of one `MapView` toggle in the same commit, especially under GPU/memory pressure — a platform rendering artifact, not a state bug.
- **Fix strategy**: can't fix a platform race by re-reading JS state. Defensive, low-risk mitigation: key the four filterable overlay layers by `activeMapFilter` so a filter change forces React to fully unmount the old Marker/Polygon tree and mount a fresh one, instead of relying on native-side prop diffing to remove individual children. Cheap (≤150 elements), eliminates any diffing ambiguity as the source of stale markers regardless of root cause.
- **Testing method**: emulator A/B test — identical viewport, toggle All → Gates → Rastas → Blocks → Pindal, screenshot each, confirm only the selected category's markers render every time, repeated 3x for flakiness.

## 2. Gate marker label collisions

- **File**: `src/services/V2MapRenderingService.ts` (`getHomeLayers`), `src/views/components/map/GateLayer.tsx`.
- **Root cause**: `GateLayer`'s zoom-tier label shortening (full → `G05` → `05`) reduces label *width* but does nothing when multiple gate pins occupy overlapping screen space — no collision avoidance exists.
- **Fix strategy**: add a proximity-based greedy declutter pass over `visibleGateMarkers` in `getHomeLayers`. Convert each gate pair's lat/lng gap to an approximate on-screen pixel distance at the current zoom (Web Mercator meters-per-pixel formula), and when two gates are closer than a minimum label width, drop the lower-priority one (selected > major gate > rest) rather than render an overlapping/clipped label.
- **Testing method**: emulator, zoom to the northern gate cluster at medium zoom (previously showed `Ga`/`Ga Ga`/`G` fragments), confirm every visible label is fully legible with no overlap.

## 3. Layers control is a native `Alert.alert`

- **File**: `src/views/screens/HomeScreen.tsx` (`openLayerOptions`, ~line 484), new `src/views/components/map/LayersSheet.tsx`, `src/store/useAppStore.ts`.
- **Root cause**: never redesigned across all 11 prior UX phases — flagged repeatedly, never fixed.
- **Fix strategy**: new bottom-sheet-style component: Satellite/Standard segmented control + independent overlay toggles for Blocks/Gates/Rastas/Pindal. Add 3 new persisted store booleans (`showGatesLayer`/`showRastasLayer`/`showSpecialRoutesLayer`, default `true`) ANDed into the existing single-select `mapFilter` visibility math — additive only, doesn't touch the filter-chip model.
- **Testing method**: emulator, open Layers sheet, toggle each overlay off/on independently, confirm map updates and sheet is usable one-handed (large touch targets, bottom-anchored).

## 4. Route preview card

- **File**: `src/views/screens/HomeScreen.tsx` (`routePreviewCard` render, ~line 1116).
- **Root cause**: destination/ETA/distance/start-button already present and close to spec; the recommended gate is buried inside a prose summary sentence instead of its own labeled row.
- **Fix strategy**: add an explicit "Enter Gate NN" row when `startResolution.mode === 'outside'`, using already-computed `activeRoute` data — no new computation needed.
- **Testing method**: emulator, preview a route from outside the venue, confirm gate row renders distinctly.

## 5. Outside routing can discard a valid connected gate to full beeline

- **File**: `src/services/RoutingServiceV2.ts` (`selectOutsidePathViaStreetGraph`, ~line 627).
- **Root cause**: `candidateGates` filters only by `routingStatus`/`canStartRouteFromOutside`, not internal-graph connectivity. When the street-graph-cheapest gate happens to be internally disconnected (e.g. `GATE_03`), the post-hoc check at line 641 discards the *entire* street-graph result and falls through to full beeline for every gate — losing road-following fidelity for users near a disconnected gate instead of retrying the next-best connected one.
- **Fix strategy**: pre-filter `candidateGates` with `getConnectedCandidates([gate.id]).length > 0`, mirroring the pattern `resolveOutsideGateSeeds` already uses for the beeline path (line 483). The multi-target A* in `selectStreetGraphOutsidePath` then only ever considers valid gates, so it can't win with a disconnected one in the first place. Targeted filter fix, not a routing algorithm change.
- **Testing method**: `scripts/test-outside-street-routing-v2.ts` plus a live check near `GATE_03`'s street-graph catchment — confirm the next-nearest *connected* gate now gets a real street-following path instead of a beeline.

## 6. Performance: layers not memoized

- **File**: `src/views/components/map/BlockLayer.tsx`, `GateLayer.tsx`, `RastaLayer.tsx`, `SpecialRouteLayer.tsx`.
- **Root cause**: none are wrapped in `React.memo`, so every 1s/2m GPS update cascades into re-renders of all four regardless of whether their own props changed.
- **Fix strategy**: wrap each in `React.memo`. Props are plain objects/arrays computed via `useMemo` upstream (`v2MapLayers`), so referential equality holds between GPS ticks that don't touch map data.
- **Testing method**: React DevTools profiler / manual re-render count sanity check; typecheck + existing script suite for regressions.

## Explicitly not touched (per instruction: no architecture rewrite, no routing rewrite)

- The two diverging outside-gate-selection implementations (`RoutingServiceV2.selectOutsidePath` vs `EntryGateRoutingService.findBestGateForOutsideUser`) are not being unified this pass — that's an architectural consolidation, not a bug fix.
- The uncaptured console warning (audit finding #7) needs a live device session to reproduce; not actionable as a code fix.
- Committing the working tree is a separate, explicit user decision (git operation), not part of this fix pass.
