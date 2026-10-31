# Karachi Ijtema Offline Navigation Project Guide

Shared engineering contract for any AI agent (Codex, Claude, or otherwise) working in this repo. Current project status, test totals, and issue state live in `docs/PROJECT_STATUS.md`, not here — this file is the durable contract, not a snapshot.

## Project purpose

Offline-first pedestrian navigation for attendees walking to and inside the Karachi Ijtema venue. Internal routing must work with no network. Outside-venue routing prefers live providers but must degrade to a bundled offline fallback, never a dead end.

## Canonical branch

For Muslim Ummah Offline Navigation SDK work, the sole authorized checkout is `/Users/ghilmankhan/workprojects/offline-map` on `feat/muslim-ummah-offline-navigation-sdk`. Verify actual HEAD, status, origin-tracking and live remote before work. Preserve the original senior-testing baseline `integration/ijtema-clean-baseline`; do not switch to or modify it. See [the permanent SDK rule and closure checkpoint](docs/sdk/release-closure-2026-11-01/README.md).

## Start-of-task check

Before non-trivial work: confirm canonical HEAD, read the linked issue in full, check for a relevant skill, and check `git worktree list` / `git status` so you don't build on someone else's uncommitted state.

## Skills-first, plan-first, issue-first

- If a skill exists for the task, use it — don't hand-roll a process a skill already owns.
- Non-trivial changes get a short plan before code. Trivial fixes don't need ceremony.
- Work traces to an issue. If no issue exists for real work, open one before or alongside the change rather than doing untracked work.

## One concern per PR

A PR does one thing. Don't bundle an unrelated cleanup, dependency bump, or drive-by refactor into a feature/fix PR — split it.

## No guessing

- **No fabricated GIS**: gate coordinates, venue graph edges, routing distances, and connector geometry come from surveyed/confirmed sources or existing code — never invented to fill a gap. If a coordinate or edge is unverified, say so; don't approximate silently.
- **No fabricated legal content**: privacy policy, terms, licensing, and attribution text are not to be authored speculatively — those are owner-provided facts (see `docs/RELEASE_SECURITY_PRIVACY.md` and `docs/KNOWN_LIMITATIONS_AND_OWNER_ACTIONS.md`).
- **No fake signing/cloud state**: never claim a keystore, Play App Signing enrollment, CI secret, or deployed-proxy state exists or was verified without actually checking it in that exact environment.

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
- The map is MapLibre on a bundled offline basemap: the app holds no Google Maps SDK key. Never add one, and never reuse any client-visible key for Google Routes.
- Never commit `.env`, signing credentials, keystores, local properties, tokens, or secret-bearing logs.
- Ignore old APK/build outputs. After integration, build a fresh release APK from the intended final commit and record its commit, build command, timestamp, and checksum before device testing.

### Evidence levels — never claim a higher one than you actually ran

| Level | What it proves | What it does NOT prove |
|---|---|---|
| **SOURCE/RUNTIME VERIFIED** | Jest/typecheck/lint passed against source and JS logic | Real Android/iOS behavior, sensors, native modules |
| **EMULATOR VERIFIED** | Behavior observed in an emulator/simulator build | Real GPS, real network conditions, physical hardware quirks |
| **PHYSICAL DEVICE REQUIRED** | Not yet run — needs a real device | — |
| **FIELD REQUIRED** | Not yet run — needs the actual venue/walking test | — |

Label every verification claim with its actual level. Do not describe SOURCE-level checks as if they were EMULATOR, DEVICE, or FIELD verified.

## Branch and worktree rules

- SDK work uses exactly one existing checkout and one branch as specified above. Never create extra worktrees, clones, implementation branches or divergent development copies. Never move SDK development into `.codex/worktrees`.
- One active source writer. Independent reviewers remain read-only while a writer is active. Temporary isolated build/consumer-test directories are allowed only when technically required; they are not alternate development checkouts.
- Record every completed change, validation summary, evidence manifest, QA result, release decision and continuation handoff under tracked `docs/sdk/` documentation. Large binaries/raw logs may remain external with verified paths, hashes and reproduction instructions recorded.
- After each validated atomic change: review the actual diff, run relevant checks, stage intended paths, commit and push normally, then verify local/origin/live remote equality, a clean tree and exactly one registered worktree. Preserve historical stashes/evidence and the baseline branch.
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

## Checkpoint discipline

On a long or multi-phase task, don't run to exhaustion. Near your session's usage/context limit: stop starting new large operations (bulk deletes, migrations, builds, emulator campaigns), finish the atomic step in progress, commit/push validated work, update the linked issue/PR, and hand off with: canonical HEAD, what's done, what's remaining, and the exact next action. No giant session-history dump — the issue tracker and git history are the record.

## Token efficiency

Prefer targeted reads (specific files/line ranges) over dumping whole directories. Delegate large read-heavy investigations (multi-file audits, branch forensics) to a subagent that returns a distilled report rather than pulling raw output into the main context. Don't re-read a file you just wrote/edited — trust the tool.

## Definition of done

A change is done when: it's scoped to one concern, tests at the appropriate evidence level pass, the linked issue/PR is updated with real status (not aspirational status), no fabricated GIS/legal/signing claims were introduced, and the working tree is clean or the remaining diff is explained.
