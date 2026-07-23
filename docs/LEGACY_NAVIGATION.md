# Legacy Navigation (v1) — Deprecated Pieces

v1 (`src/constants/data.ts`, `RoutingService`, `NavigationViewModel`) is an
intentional rollback/dev fallback — see CLAUDE.md. It is NOT deprecated as a
whole; it is a live, still-rendered navigation path (`NavigationChromeV1` via
`useNavigationOverlayV1`, wired in `HomeScreen.tsx`). This file tracks only
specific pieces confirmed unused.

## Confirmed dead

### `SnapToRoadService.snapToRoad()` (src/services/SnapToRoadService.ts)

A "backward-compatible alias" for `snapVisualToRoad(coord, 20)`. Verified via
repo-wide grep (2026-07): no call sites anywhere in `src/`. The rest of
`SnapToRoadService` (`snapVisualToRoad`, `resolveRoutingNode`) is live — both
are called from `NavigationViewModel.ts` (v1), which renders in-place via
`NavigationChromeV1` in `HomeScreen.tsx` whenever nav mode is
`NAVIGATION`/`ARRIVAL`.

**Use instead:** `SnapToRoadService.snapVisualToRoad(coord, thresholdM)` directly.

**Status:** marked `@deprecated` in JSDoc, not deleted (kept to avoid an API
break). Safe to remove in a standalone cleanup PR once nothing references it.

## Not deprecated (common misreadings)

- `SnapToRoadService` as a class — still fully live in the v1 nav path.
- `resolveRoutingNode`'s outside-venue boundary-node snap — this predates
  `docs/OUTSIDE_IJTEMA_ROUTING_RULE.md`'s gate-only rule, which is explicitly
  scoped to v2. v1 has no gate model, so this is legacy-consistent behavior,
  not a rule violation. Do not "fix" it to route through v2 gates without a
  deliberate v1 redesign decision.

## How to verify a v1 piece is actually dead before deprecating it further

1. `grep -rn "<Name>" src/ --include="*.ts" --include="*.tsx"` and check every
   hit is either the definition or a comment.
2. Trace upward: is the importing file itself reachable from a screen/viewmodel
   that's actually rendered? (e.g. `useNavigationOverlayV1` → `HomeScreen.tsx`)
3. Don't rely on "not called from v2" as evidence of "dead" — v1 has its own
   live call graph, independent of v2's.
