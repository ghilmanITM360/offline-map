# Known Limitations and Owner Actions

## Product-risk limitations (not fixed, not currently planned)

- **No walkability/crowd-flow modeling.** Temporary closures, one-way pedestrian flow, or blocked areas during the actual event are not modeled anywhere in the routing graph. For a live mass gathering, this is a real product risk, not just a data-completeness gap — routes can suggest paths that are physically blocked or against enforced flow on the day. No fix is in progress; flag if this becomes a field-reported issue.
- **iOS is not fully runtime-verified.** Development so far has centered on Android; iOS has an unset Maps key placeholder (see `docs/RELEASE_SECURITY_PRIVACY.md`) and no equivalent device-verification pass.

## Deliberately kept, not defects

- v1 routing/data system (`src/constants/data.ts`, `RoutingService`) is kept as a rollback path behind feature flags, not deleted, to avoid an API break. Do not "clean it up" without an explicit decision to drop rollback capability. v1 as a whole is **not deprecated** — it's a live, intentional rollback path per `AGENTS.md`/`CLAUDE.md`, not a blanket deprecation notice.
- Within that live v1 code, exactly one function is actually dead: `SnapToRoadService.snapToRoad()` has no call sites and stays marked `@deprecated`. The rest of `SnapToRoadService` (`snapVisualToRoad`, `resolveRoutingNode`) is live, called from v1's `NavigationViewModel` — do not delete or un-deprecate either without updating this doc.
- `isNavigating` vs `MapMode` are intentionally separate state (see `docs/ARCHITECTURE.md`) — do not merge them without re-reading why that was rejected before.

## Resolved (do not reopen without new evidence)

- Gate label clipping on Android markers — resolved by moving label rendering to a separate `MapLabelOverlay` layer instead of native `Marker` children (see `docs/ARCHITECTURE.md`). Earlier audits describing this as open are retired.
- Routing-core Dijkstra duplication — consolidated into shared `src/utils/AStar.ts`.
- Stale/duplicate gate-selection cost path (`EntryGateRoutingService.findBestGateForOutsideUser`) — removed; single path now lives in `RoutingServiceV2`.

## Owner actions (cannot be completed by an agent)

| # | Action | Why it needs the owner |
|---|---|---|
| #47 | Privacy / Terms / Support links | Legal content must be owner-provided, never agent-drafted |
| #48 | Production signing / Play App Signing | Requires owner's Play Console access and real keystore custody |
| #49 | Google Maps production restrictions | Requires owner's Google Cloud Console access |

## Field blockers (need the physical venue)

| # | Action |
|---|---|
| #43, #44 | Gate 18/19 graph connector survey |
| #46 | Physical Ijtima walking acceptance test |

## Physical-device blockers (need real hardware)

| # | Action |
|---|---|
| #45 | LOC-01..12 Android location-capability runtime verification |

None of the above should be marked done based on source-level or emulator-level checks alone — see the evidence-level rule in `AGENTS.md`.
