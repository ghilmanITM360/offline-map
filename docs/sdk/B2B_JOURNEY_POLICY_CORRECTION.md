# B2b correction: the real journey-start policy (AUD-01)

Supersedes the B1 RFC statement (commit 15ad78b, kept as history) that the Directory flows through
`JourneyStartPlanner.planDestinationTap`. That function is exported and unit-tested but has **no production caller**
(`grep planDestinationTap src` outside `__tests__` finds only its definition). It is not moved by B2b.

## Production call graph

`LocationsDirectoryScreen` (destination tap) -> `useAppStore.setPendingJourney({destination})` ->
`evaluateLocationCapability` over store facts -> writes `pendingJourney`, bumps `destinationIntentSerial` /
`directoryJourneySerial`, resets directory request/choice, sets `destinationJourneyIntent.autoLive`
(`eligible` iff not navigating, services `enabled`, capability mode `live_navigation`).
`HomeScreen` consumes `pendingJourney` (`setPendingJourney(null)` is consumption, not cancellation).
`DirectionsViewModel` calls `consumeDestinationIntent(id)` once (live_gps start, no manual start, still current) and
`retireDestinationIntent(id)` / `useManualLiveUpgrade` on abandonment. `setDirectoryChoice` / `consumeDirectoryChoice`
reject answers whose request serial/journey/destination/purpose is not current.

## Four layers (do not conflate)

| Layer | Owner | Examples |
| --- | --- | --- |
| 1. Pure decision policy | SDK domain (B2b) | `evaluateLocationCapability`, `classifyLiveFix`, navigation start gate, start-action kind, `JourneyPresentationState`, intent eligibility / consume / retire, directory-choice freshness. Facts in, decision out, injected `nowMs`. |
| 2. Application state mutation | Host (Zustand) | `useAppStore` setters apply the decision with `set(...)`; serial counters, persistence, route planner fields. |
| 3. GPS / native acquisition | Host | `GPSManagerService`, `LocationAccessService`, Expo location, permission prompts. Produce the facts. |
| 4. UI presentation / stack | Host | Localized labels (`t(...)`), `LocationSheet`, navigation stack, `resetToDirectoryAction`. |

## B2b scope consequences

- Extracted: layer 1 only. Old `src/services/*` paths remain as thin facades that supply `Date.now()` and `t(...)` copy.
- The store applies the extracted decisions; it is not moved. No NavigationController is introduced.
- `JourneyStartPlanner` stays host-owned (test-only). Tracked finding: delete or adopt it in a later stage.
- Behaviour pinned beforehand by `src/__tests__/JourneyPolicyCharacterization.test.ts`.
