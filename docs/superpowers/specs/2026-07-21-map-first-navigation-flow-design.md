# Map-First Navigation Flow — Design

Date: 2026-07-21

## Problem

The app should replicate the Google Maps navigation UX: tap a destination on
the map → a bottom sheet appears with distance/ETA and a Directions button →
Directions computes and previews a route → Start Navigation transforms the
same map into turn-by-turn navigation. No separate directions screen should
ever be pushed.

Today, tapping a marker does not reliably reach this flow at all, and even
where it partly works, it goes through a separate-screen hop the target
architecture explicitly forbids.

## Root cause investigation

Traced the tap path across `BlockLayer`, `GateLayer`, `RastaLayer`,
`SpecialRouteLayer` (Pindal/Shahr-e-Pindal), `HomeScreen`, `useScreenMode`,
`DirectionsViewModel`, and `DirectionsScreen`. Two independent bugs, not one
shared root cause:

1. **Rastas and Pindals are wired to nothing.** `BlockLayer.tsx` and
   `GateLayer.tsx` both take an `onPress*` prop and wire it to
   `tappable`/`onPress` on their shape (`BlockLayer.tsx:50-51`,
   `GateLayer.tsx:45`). `RastaLayer.tsx` and `SpecialRouteLayer.tsx` have no
   `onPress` prop at all, and `HomeScreen.tsx` renders them without one
   (`HomeScreen.tsx:788-800`). Their `mapLabelItems` label entries
   (`HomeScreen.tsx:449-475`) also omit the `onPress` callback that
   gate/block labels have (`HomeScreen.tsx:403-447`). Tapping a Rasta or
   Pindal today does nothing — not even selection/highlight.

2. **Blocks/Gates select and highlight correctly, but then require a second
   tap into a separate screen.** Tap → `handlePlaceSelect` opens a bulky
   "place detail" bottom sheet (Save/Share/Info/description/entrances) → a
   "Directions" button mounts `DirectionsScreen` (658 lines: its own
   start-point picker, its own loading/error states) as swapped-in sheet
   content (`useScreenMode`'s `DIRECTIONS_FORM` mode) → *that* eventually
   produces the route-preview card, which is already correct
   Google-Maps-style UI (ETA/distance/Start Navigation). States 3
   (Route Preview) and 4 (Active Navigation) of the target architecture
   already exist and are correct (per the prior
   `docs/ROUTING_NAVIGATION_FIX_REPORT.md` fix pass); the break is entirely
   in states 1→2→3 — an extra screen-swap sits between tap and the
   distance/ETA/Directions bottom sheet.

Additional finding that shrinks scope: `DirectionsViewModel.calculateRoute`
already auto-runs on mount (`useEffect(() => { void calculateRoute(); },
[calculateRoute])`) and defaults to live GPS as the start — it is not gated
behind a second button press today, it's just wrapped inside the
screen-swapping `DirectionsScreen`. Also, `RoutingServiceV2` already fully
resolves Rasta/Special-Route destinations by ID
(`RoutingDestinationV2` has `{type:'rasta', rastaId}` /
`{type:'special_route', routeId}` cases, `RoutingServiceV2.ts:266-284`),
proven by existing passing tests for "Shahr-e-Pindal North" routing
(`scripts/test-directions-v2.ts`). So the nearest-point-on-a-line routing
behavior the target UX needs for Rasta/Pindal destinations is already
implemented at the routing-engine level — the only real gap for those two
marker types is the tap wiring itself.

## Scope

**Untouched:** `RoutingServiceV2`, `V2DirectionsService`, the route
calculation engine, the `ROUTE_PREVIEW` floating card UI, `ACTIVE_NAVIGATION`
(`NavigationChromeV2` / `NavigationMapLayersV2` / `useNavigationOverlayV2`),
and the v1 legacy fallback path (not exercised when the v2 map is on, which
is the production default per `.env.example`).

**Changing:**
- `RastaLayer.tsx` / `SpecialRouteLayer.tsx` — add `onPress` wiring mirroring
  `BlockLayer`/`GateLayer`, plus a transparent wider-stroke "hit target"
  `Polyline` underneath the visible 3-7px line so real-device taps land
  reliably. `HomeScreen.tsx`'s `mapLabelItems` gets matching `onPress`
  entries for rasta/route labels.
- New `DestinationSheet` component replaces the current three-way sheet
  content branch (place-detail card / `DirectionsScreen` / floating preview
  card) with one continuous sheet.
- `useScreenMode.ts` — drop `DIRECTIONS_FORM` as a top-level mode; rename
  `PLACE_SELECTED` to `DESTINATION`. Its concerns become an internal
  sub-state of `DestinationSheet`, not a competing global mode.
- `DirectionsViewModel.ts` — reused almost as-is; only the destination-set
  trigger moves from "user pressed Directions in a pushed screen" to "user
  tapped a marker."
- `DirectionsScreen.tsx` — retired as a sheet-swapping screen. Its
  start-picker JSX (current/remembered/manual-search rows) is extracted into
  a `StartPicker` sub-section rendered inside `DestinationSheet`.
- Save/Share/Info/description move into a "More info" sub-state within the
  same sheet, not a separate screen.
- v1-sourced destinations (only reachable when the v2 map flag is off) keep
  their existing, separate, already-fixed behavior — out of scope.

## State model

`useScreenMode` modes:

```
EXPLORE            — nothing selected
DESTINATION         — a place is selected (was PLACE_SELECTED)
ROUTE_PREVIEW       — route computed and confirmed onto the map (unchanged)
ACTIVE_NAVIGATION   — unchanged
MAP_SETTINGS        — unchanged
```

`DIRECTIONS_FORM` is removed. The old "have we pressed Directions yet"
distinction disappears because route calculation now starts the moment a
destination is selected, not when a Directions button is pressed.

`DestinationSheet` owns its own internal sub-state (component-local, not a
`ScreenMode`): `'summary' | 'start_picker' | 'more_info'`.

- **`summary`** (default on selection): name, category badge, distance, ETA
  badge, warning banner if `unavailableReason`/`needs_connector_verification`,
  "Directions" button, "Change start" link, "More info" link.
- **`start_picker`**: extracted `DirectionsScreen` body (current/remembered/
  manual-search rows) minus the route-summary header (already shown above).
  Choosing a start collapses back to `summary` with the route recomputed for
  that origin.
- **`more_info`**: today's Save/Share/Info/description/entrance-chips
  content.

Pressing "Directions" in `summary` does not recompute anything — the route
is already known. It's purely a display transition: `useScreenMode` sees
`activePreviewRoute` become non-null and flips to `ROUTE_PREVIEW`, handing
off to the existing, untouched floating preview card.

## Data flow (all four marker types)

1. **Tap.** `BlockLayer`/`GateLayer` call `onPressBlock`/`onPressGate` →
   `V2PlaceAdapter.getPlaceById` → `handlePlaceSelect(place)` (unchanged).
   `RastaLayer`/`SpecialRouteLayer` get the same `onPress` wired onto their
   `Polyline` (`Polyline` passes `onPress` straight through to the native
   view — no `tappable` prop needed, unlike `Polygon`). Their
   `mapLabelItems` label markers get the same `onPress` gate/block labels
   already have.
2. **Select.** `handlePlaceSelect` unchanged — sets `selectedPlace`, opens
   the sheet. `useScreenMode` reports `DESTINATION`.
3. **Auto-calculate.** `DestinationSheet` mounts the same, unmodified
   `useDirectionsViewModel(selectedPlace)` hook `DirectionsScreen` uses today
   (default `startSource: 'live_gps'`) — same auto-`useEffect(calculateRoute)`,
   no explicit user action. It's consumed by `DestinationSheet` instead of
   `DirectionsScreen`; the hook itself is not modified. While
   `loadState === 'loading'`, the
   sheet shows name/type with a distance/ETA skeleton; on `'ready'`, real
   numbers appear. `unavailableReason`/`needs_connector_verification` shows
   the existing warning-banner treatment instead of distance/ETA.
4. **Directions press.** No recomputation — `calculateRoute` already
   populated `activeRoute`/`routePlannerDest` in the store the moment the
   sheet opened (step 3). `useScreenMode` sees `activePreviewRoute`
   non-null and flips to `ROUTE_PREVIEW`; the existing floating
   `routePreviewCard` takes over untouched.
5. **Start Navigation.** Unchanged — `handleStartPreviewNavigation` →
   `startNavigation()` → `showNavOverlay` → `ACTIVE_NAVIGATION` →
   `NavigationChromeV2`/`NavigationMapLayersV2`/`useNavigationOverlayV2`
   (live GPS, camera follow, turn instructions, ETA, arrival detection — all
   pre-existing).
6. **Change start / More info.** Same-sheet sub-state toggles, not screen
   navigation. Choosing a new start re-runs step 3's `calculateRoute` with
   the new origin and returns to `summary`.

## Error / edge handling

- **No GPS / permission denied at tap time** — `loadState: 'needs_origin'`
  (already exists); sheet shows "Choose starting point" instead of
  distance/ETA and opens directly into `start_picker`.
- **Outside the venue** — unchanged; `activePreviewRoute.startResolution`
  already drives "enter through nearest gate" messaging, now surfaced in the
  new sheet.
- **Unroutable destination** (`needs_connector_verification` /
  `visual_only` / `missing_coordinate`, e.g. an unconnected Pindal segment
  or unverified gate) — warning-banner text replaces distance/ETA;
  "Directions" is disabled rather than failing silently.
- **Route calculation failure/timeout** — inline retry affordance instead of
  a blank ETA.
- **Rapid re-selection** (tap Block A, then Block B before A resolves) —
  `DestinationSheet`'s internal calc state is keyed/reset on
  `selectedPlace.id` so a late response for the previous selection can't
  clobber the new one.
- **v1 legacy destinations** — out of scope; unchanged, separate,
  already-fixed behavior (Phase 4 of the prior fix report), not exercised
  when the v2 map is on.

## Test plan

- **Script tests** (existing `scripts/test-*.ts` pattern), one per marker
  type: tapping a Block/Gate/Rasta/Pindal calls the shared select handler
  and the sheet reaches populated `distance`+`eta` with zero additional user
  action.
- **Jest**: replace `DirectionsScreen.test.tsx` with
  `DestinationSheet.test.tsx` — asserts immediate distance/ETA on selection,
  "Directions" flips mode to `ROUTE_PREVIEW` with no component swap,
  `start_picker`/`more_info` toggles work without losing the destination.
- **Regression**: full existing `npm test` (routing + nav jest suite) stays
  green untouched, since `ROUTE_PREVIEW`/`ACTIVE_NAVIGATION` internals are
  not modified.
- **Device verification**: one full tap→sheet→Directions→route
  preview→Start→live nav→arrival walkthrough each for a sample Block, a
  Gate, a Rasta, and all 3 Pindals, recorded as evidence under
  `docs/qa-evidence/`. Not all 42 blocks individually (shared `BlockLayer`
  code path) — one representative block plus the script-level sweep across
  all 42 IDs.

## UI polish while implementing

Scoped to issues directly encountered while building the sections above —
not a separate redesign pass. If the new `DestinationSheet` surfaces a real
regression in bottom-sheet responsive behavior, close-button placement,
route-preview positioning, marker-selection consistency, or label clipping,
fix it as part of the relevant section's work. Zoom/layer/filter-chip
controls are not touched unless the flow change above breaks them (e.g. the
`controlStackBottom` collision-avoidance math already keyed off
`activePreviewRoute` needs to keep working once `DestinationSheet` replaces
today's separate preview-card/place-card elements).

## Remaining risks

- The transparent wider-stroke "hit target" polyline for Rasta/Pindal taps
  is a judgment call on stroke width — needs real-device confirmation that
  it doesn't accidentally overlap adjacent rasta/gate/block tap targets.
- Extracting `DirectionsScreen`'s start-picker into a `StartPicker`
  sub-section changes its rendering context (no longer a full-screen
  component) — existing jest tests for it will need updating, not just
  moving.
- Device-level verification is manual per the test plan above; no automated
  script can confirm the physical map surface actually receives the tap
  (script tests assert wiring, not real touch-target geometry).
