# Karachi Ijtema Offline Navigation Project Guide

## Product architecture

- React Native/Expo app uses one map-first `HomeScreen` and one shared `MapView`. Directions, route preview, active navigation, and arrival are map overlays/modes, not separate screens.
- Internal Ijtema routing is pedestrian-only over the bundled venue graph. Internal routing and bundled outside OSM fallback remain offline.
- Every outside start coordinate follows the same policy, regardless of whether it came from GPS, search, map selection, or remembered state:

  ```text
  outside coordinate
  -> prepareOutsideRoutingPlan
  -> configured Google walking-route proxy
  -> bundled OSM fallback
  -> labelled direct-direction guide
  -> finalizeOutsideRoutingPlan
  ```

- A supplied coordinate inside the Ijtema uses the normal internal pedestrian route. Start-source labels must not change routing policy.
- Automatic outside gate selection minimizes complete pedestrian journey cost: outside route + gate connector + gate penalty + internal route. Manual gate selection remains authoritative.
- Confirmed official coordinates:
  - Gate 12: `24.963676, 67.006339`
  - Gate 13: `24.963718, 67.006862`
  - Gate 14: `24.965516, 67.007675`

## MVVM ownership

- Views: rendering, accessibility, and action forwarding only.
- ViewModels: route lifecycle, retry, manual start/gate selection, cancellation/stale-result handling, and valid-route retention.
- `V2DirectionsService`: inside/outside dispatch and hybrid route workflow.
- Hybrid orchestrator: provider order and fallback (`Google -> OSM -> direct guide`).
- `RoutingServiceV2`: gate eligibility, internal routes, complete-journey selection, and final route composition.
- Outside providers: outside candidate geometry/distance/duration only. They do not choose the complete journey.
- Keep provider ordering and complete-route cost out of Views and ViewModels.

## Security and verification boundaries

- Mobile may contain only proxy base URL configuration. Never place Google Routes web-service credentials, proxy signing secrets, or privileged bearer tokens in mobile code or `EXPO_PUBLIC_*` variables.
- Google Maps SDK keys are separate client-visible rendering credentials. Restrict them by platform/application; never reuse them for Google Routes.
- Never commit `.env`, signing credentials, keystores, local properties, tokens, or secret-bearing logs.
- Automated tests verify source and JavaScript behavior only. Do not claim Android, iOS, physical-device, deployed-proxy, or real Google Routes verification without running that exact environment.
- Ignore old APK/build outputs. After integration, build a fresh release APK from the intended final commit and record its commit, build command, timestamp, and checksum before device testing.

## Branch and worktree rules

- Use one isolated branch and worktree per task. Verify source ref, target branch, target path, and worktree list before creation.
- Do not modify a dirty integration worktree while implementing isolated work.
- Stage explicit paths and create focused commits. Do not include generated files or unrelated local changes.
- Do not push, merge, rebase, reset, clean, delete branches/worktrees, or perform destructive Git operations without owner approval.

## Required validation

Run before handoff:

```bash
npm run typecheck
npm run lint
npm test
npm run test:components -- --runInBand
git diff --check
```

Routing changes also require focused coverage for affected providers/ViewModels plus:

```bash
npm run test:all-gates-v2
npm run test:outside-street-gate-selection-cost-v2
npm run test:core-provider-routing-contract-v2
npm run test:reroute-v2
```

Report exact commands, pass/fail counts, warnings, unverified runtime boundaries, final HEAD, and final Git status.
