# Navigation State Architecture — `isNavigating` vs `MapMode`

Status: **Decision recorded. `isNavigating` kept as-is, not merged into MapMode.**

Date: 2026-07-23

## Why `isNavigating` exists

`isNavigating` (`src/store/useAppStore.ts`) is the store's single raw boolean marking
"a nav session is bracketed by `startNavigation()`/`stopNavigation()`". It has exactly one
writer — those two store actions — enforced by `scripts/test-navigation-architecture-audit.ts`
Finding 6a (asserts exactly 3 assignment sites: initial state + the two actions).

`MapMode` (`src/viewmodels/useMapMode.ts`) is a stricter, purely-derived concept layered on
top of it. `deriveMapMode` returns `NAVIGATION` from `showNavOverlay`, not from `isNavigating`
directly — `showNavOverlay` additionally requires the active route to match the live
feature-flag/source-version shape (v2 nav flag + `sourceVersion === 'v2'`, or the v1 path).
So `MapMode` can legitimately read something other than `NAVIGATION` while `isNavigating` is
still `true` — e.g. under an emergency `EXPO_PUBLIC_USE_IJTEMA_V2_NAVIGATION=false` rollback,
the v2 nav runtime keeps running (GPS tracking, reroute, arrival detection) but its chrome is
suppressed. `isNavigating` is the thing that must stay true through that window; `MapMode`
is not.

## All consumers (closed list, regression-locked)

Direct `useAppStore((s) => s.isNavigating)` reads, outside the store itself:

| File | Why it reads the raw primitive, not `mode` |
|---|---|
| `src/viewmodels/HomeViewModel.ts` | Camera-follow and compass-follow gating (`shouldTrackLiveLocation`, `FOLLOWING_USER`/`FOLLOW_HEADING` branches). Must keep suppressing camera auto-follow for the whole nav session even when MapMode's `NAVIGATION` chrome is flag-suppressed — using `mode` here would silently break camera behavior under the v2-nav rollback flag. |
| `src/views/screens/HomeScreen.tsx` | `activePreviewRoute` memo early-returns `null` when `isNavigating`. This memo is one of `deriveMapMode`'s own inputs (`ROUTE_PREVIEW` derivation) — reading `mode` here to decide the memo's value would be circular. |
| `src/viewmodels/NavigationViewModelV2.ts` | Gates whether `activeRoute` is treated as the live nav route (`route = isNavigating && isV2ActiveRoute(activeRoute) ? activeRoute : null`) and keys the live-location effect. This is upstream of `showNavOverlay`, i.e. upstream of `MapMode` itself — `MapMode` cannot be used to compute one of its own inputs. |

Every other read in the codebase is inside `useAppStore.ts` itself (state field + the two
writer actions) or is a comment referencing this doc.

The list is enforced, not just documented: `scripts/test-navigation-architecture-audit.ts`
Finding 6b does a recursive source scan asserting these three files are the *only* direct
`.isNavigating` readers. A new consumer added without updating that test fails CI. Finding 6d/6e
pin the derivation chain (`showNavOverlay` → `deriveMapMode` → `NAVIGATION`/`ARRIVAL`) and the
one documented rollback exception where `MapMode !== NAVIGATION` while `isNavigating === true`.

## Can it merge into `MapMode` later?

Not safely, for two structural reasons — not just current laziness:

1. **Circularity.** `HomeScreen.tsx`'s `activePreviewRoute` memo is itself one of `deriveMapMode`'s
   inputs. `MapMode` can't be the source of a value it's also derived from.
2. **Behavior divergence is load-bearing.** The rollback-flag case (`isNavigating: true`,
   `MapMode: not NAVIGATION`) is a real, currently-exercised state, not a theoretical edge case —
   it's what makes the v2-nav emergency rollback flag actually safe (GPS/reroute/arrival keep
   running; only chrome hides). Collapsing to `MapMode === NAVIGATION` as the sole authority
   would either break that rollback path or require `MapMode` to grow a second, non-priority-chain
   axis, which defeats the point of `deriveMapMode` being a flat priority chain
   (see its own doc comment on why folding checks into one mode was the fix for the old
   "two modes true at once" bug class).

If the rollback flag is ever retired outright (v2 nav becomes unconditional, no flag-off path),
reason 2 disappears and `HomeViewModel.ts`'s reader could likely be dropped in favor of `mode`.
Reason 1 (`HomeScreen.tsx`) and the `NavigationViewModelV2.ts` reader (structurally upstream of
`MapMode`) would still need `isNavigating` as a primitive regardless. Revisit only if/when the
rollback flag is removed — not before, and not as this pass's scope.
