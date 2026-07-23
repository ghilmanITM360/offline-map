# Map-First UX Gap Analysis

Status: **Analysis only. No code changed.**

Compares `docs/Map-First Navigation Flow Implementation Plan.md` (written this session, design-approved-not-implemented) against actual current code state, `docs/REAL_DEVICE_UX_AUDIT.md` (screenshot findings), `docs/MAP_EXPERIENCE_AUDIT.md` (prior architecture audit the plan was based on), and `docs/OUTSIDE_TO_INSIDE_NAVIGATION_AUDIT.md`.

**Headline finding: the plan overstates the gap.** It was written from `MAP_EXPERIENCE_AUDIT.md`, which is now stale — real code has moved past it. Phases 2, 3, 4, and 6 are substantially pre-built. Real remaining work is narrower than the plan's 8 phases suggest.

---

## 1. Already implemented

- **In-place v2 navigation on one persistent `MapView`** (plan's Phase 4 core goal) — `HomeScreen.tsx` already wires `useNavigationOverlayV2` (line 74/240). `NavigationScreen.tsx:43-45` carries its own comment: *"v2 navigation now runs in-place on HomeScreen's persistent MapView... this route is pushed only for legacy v1 routes... unreachable through normal app flow, defensive fallback only."* Only 2 `MapView` instances exist total (`HomeScreen.tsx:652`, `NavigationScreen.tsx:209`), not 3 as the stale audit claimed.
- **Directions is not a route** (plan's Phase 3 goal) — `DirectionsScreen` was never in `RootStackParamList`. It renders as a conditional child inside `HomeScreen.tsx:1326`, toggled by local state `directionsDestination`. Phase 3 is already ~done.
- **One consolidated bottom sheet** — single `BottomSheetModal` (`HomeScreen.tsx:1314-1488`) with `DirectionsScreen`'s `BottomSheetScrollView` nested inside it, not a second top-level sheet.
- **Mode-driven UI already exists**, just not named `screenMode`: `src/viewmodels/useScreenMode.ts` derives a priority-chain state (`ACTIVE_NAVIGATION` / `DIRECTIONS_FORM` / etc.) from `directionsDestination`/`isNavigating`/`activeRoute`, and already drives the search-bar/chip-row hide logic the plan's Phase 2/3 called for.
- **`MapControls.tsx`** shared component already exists, already used in `HomeScreen.tsx` (lines 1160, 1236) — plan's Phase 1 goal, half done (see §3).
- **`MapLocalizationService.ts`** already exists (`getLocalizedName()`, `getSecondaryLabel()`), already wired into `HomeScreen.tsx`, `BlockLayer.tsx`, `GateLayer.tsx`, `RastaLayer.tsx`, `SpecialRouteLayer.tsx`. Plan's Phase 6 called this net-new — it isn't.
- **Bilingual data is 100% complete**, not partially — every entry in `blocks.ts`/`gates.ts`/`rastas.ts`/`specialRoutes.ts`/`centralPoints.ts` populates `en`/`ur`/`romanUrdu` via generator functions. Layer types (`V2BlockLayer`, `V2GateLayer`, `V2PolylineLayer`) already carry a full `LocalizedLabel` alongside the flattened English `label` string.
- **3 of the 8 `REAL_DEVICE_UX_AUDIT.md` issues are genuinely fixed**, code-verified (not just claimed): orange banner overlap (#2, `HomeScreen.tsx:427` measured-offset), redundant search bar/chips crowding Directions (#4, now via `useScreenMode`), recenter loading feedback (#6, `recenterState` machine at `HomeScreen.tsx:190`).
- **Store hygiene precedent already established** — `isNavigating`/`activeRoute`/`selectedPlace`/`routePlannerOrigin` all exist in `useAppStore.ts` (lines 92-108) and are correctly excluded from `partialize` (lines 342-360). Adding `screenMode` the same way is low-risk, not a new pattern.
- **RNTL test infrastructure exists** (not documented in `CLAUDE.md`, which says "no test framework"): `@testing-library/react-native` v14 + `jest-expo`, 4 real suites (`HomeScreen.test.tsx`, `DirectionsScreen.test.tsx`, `NavigationScreen.test.tsx`, `NavigationChromeV2.test.tsx`) run via `npm run test:components`, separate from the `tsx`-script `npm test` chain.

## 2. Still missing

- **Label-clipping fix** (plan Phase 5) — no `MapLabelOverlay.tsx`, no projection code anywhere in `src/`. Genuinely unstarted, genuinely the hardest unresolved item (7 failed attempts already).
- **Full `MapControls` sharing** — not imported in `NavigationScreen.tsx` at all; only half the plan's Phase 1 goal is done.
- **`Navigation` stack route removal** — still registered (`RootNavigator.tsx:86`), still mounted. Deleting it is now a much smaller, more mechanical task than the plan implied (v2 doesn't need it; only v1's `NavigationViewModel.ts`/`NavigationScreen.tsx` still call `navigation.reset`/`goBack` against it).
- **Explicit `screenMode` field** — current mode logic is implicit (`useScreenMode` deriving from 3 separate store fields), not a single explicit state value. Plan's Phase 2 goal is a refactor of existing logic, not new architecture.
- **`MapLocalizationService` full wiring** — service exists but plan's Phase 6 scope (on-map label overlay + full sheet coverage) isn't fully wired yet; needs verification of coverage, not fresh build.
- **Recenter/zoom control collision** (#5) — confirmed still unfixed, two independent absolute-positioned `View`s, no collision check.
- **Cold-start loading skeleton** (#7) — confirmed still open.
- **LogBox `BridgelessReactContext` trace** (#3) — confirmed still open, informational/P2.
- **Satellite contrast system** (Phase 8) — confirmed greenfield, nothing built.
- **Point-projection precedent** — `react-native-maps` exposes `pointForCoordinate`/`coordinateForPoint` in its TS surface (`node_modules/react-native-maps/lib/MapView.d.ts:673,683`) but zero usage anywhere in this app. Phase 0's spike is still warranted — the API existing in the type surface doesn't confirm it behaves correctly on Android under this app's New-Architecture/Bridgeless runtime.

## 3. Conflicts with current architecture / plan corrections needed

- **The plan's phase count is now wrong.** Phases 2, 3, 4 describe building things that substantially exist. Re-scoping needed: Phase 2 → "formalize implicit mode logic into explicit `screenMode`," Phase 3 → "verify/harden existing Directions-in-sheet integration," Phase 4 → "delete now-provably-dead `Navigation` route + v1's screen-lifecycle-coupled `navigation.reset` calls," not "build in-place nav from scratch."
- **v1/v2 lifecycle coupling is real but isolated.** `NavigationViewModel.ts:379` (v1) and `NavigationScreen.tsx:69,148` call `navigation.reset`/`goBack`/`navigate` — screen-lifecycle-coupled, exactly the pattern the plan wants gone. But `NavigationViewModelV2.ts`, `DirectionsViewModel.ts`, `useNavigationOverlayV2.ts` have zero such calls — already mode-friendly. Confirms the plan's v2-only scope decision was correct; v1 code is the only place fighting the target architecture, and it's already excluded from scope.
- **`MapLabelBubble.tsx` (the reverted attempt #7) is confirmed fully gone** — no half-applied state, matches the audit's revert claim exactly. Clean slate for Phase 5's different (projection-based) approach.
- **Documentation is out of sync with code**, independent of this plan: `CLAUDE.md`'s Tests section states "no test framework (Jest/etc.)" — false, `@testing-library/react-native`/`jest-expo` are real devDependencies with 4 working suites, just not wired into the `npm test` chain or documented. Worth a separate fix, flagged here since it affects how "done" should be verified per phase below.

## 4. Screenshot issues still unresolved (from `REAL_DEVICE_UX_AUDIT.md`, code-verified this session)

| # | Issue | Status |
|---|---|---|
| 1 | Gate/block label hard-clipping | **Unresolved**, 7 attempts failed, Phase 5 not started |
| 2 | Orange banner overlaps filter chips | Fixed, verified in code |
| 3 | Dev LogBox toast | Open, P2, informational |
| 4 | Redundant search bar/chips crowd Directions | Fixed, verified in code (via `useScreenMode`, not the exact mechanism the audit log describes — functionally equivalent) |
| 5 | Recenter button overlaps zoom control | **Unresolved**, no collision-avoidance code exists |
| 6 | Recenter GPS loading feedback | Fixed, verified in code |
| 7 | Blank map on cold start | **Unresolved**, no skeleton/spinner |
| 8 | Debug overlay controls | N/A, correctly gated, not a defect |

Net: 3 fixed, 3 unresolved (1, 5, 7), 2 informational/non-defect (3, 8).

## 5. What to implement first

Revised order, given the smaller real gap:

1. **Phase 0 spike — projection API.** Still the correct first step: verify `pointForCoordinate`/`coordinateForPoint` behave correctly on Android under this app's New-Architecture/Bridgeless runtime before committing to Phase 5's design. Cheapest, highest-information action available.
2. **Fix #5 (recenter/zoom collision) and #7 (cold-start skeleton).** Both are small, well-understood, no architecture dependency — pure quick wins sitting in the P2 queue for no strong reason.
3. **Complete Phase 1 (`MapControls` sharing into `NavigationScreen.tsx`)** — mechanical, closes the "no controls during nav" gap, unblocks nothing else but should happen before further nav-mode work touches that screen.
4. **Delete the dead `Navigation` route + v1's `navigation.reset` coupling**, now scoped correctly as "delete confirmed-dead code" rather than "build mode architecture" — much lower risk than the plan implied, should move up the queue.
5. **Phase 5 (label-clip fix)** proceeds only after step 1's spike confirms the projection approach is viable — this remains the hardest, highest-value unresolved item and should not be delayed further once de-risked.
6. **Formalize `screenMode`** (Phase 2 rescoped) opportunistically alongside step 4, since deleting the `Navigation` route touches the same mode-dispatch logic.
7. Localization wiring verification (Phase 6, now "verify coverage" not "build"), then satellite (Phase 8) last, unchanged from the original plan's priority ordering.

**Recommend updating `docs/Map-First Navigation Flow Implementation Plan.md` itself** to reflect this — its phase descriptions currently overstate scope for 2/3/4/6. Not done in this pass since it wasn't requested; flagging for explicit go-ahead.
