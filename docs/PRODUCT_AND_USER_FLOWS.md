# Product and User Flows

## Onboarding

Welcome → Permission → Download Map. Each step's choice persists independently and does not re-prompt on its own:

- `hasSeenWelcome` — set once, never re-shown.
- `graphOnlyMode` / `skippedOnlineMode` — persisted user choice about offline-only operation.
- Permission — the only step that can re-prompt, and only because the OS itself re-prompts, not app logic.

## Core navigation flow

All on the one persistent map (see `docs/ARCHITECTURE.md` for why this is map-first, not screen-based):

1. Tap a marker (venue block, gate, facility) → `LocationSheet` opens showing distance/ETA.
2. Tap Directions → `LocationSheet` switches to its `routePreview` mode showing the route.
3. Tap Start Navigation → map enters navigation mode; `LocationSheet` closes, navigation chrome/overlays take over.
4. Arrival is detected via venue-boundary crossing (not just distance-to-point) and switches the UI back to a resting map state.

Start-source (GPS, search, map tap, remembered state) never changes routing policy — every outside coordinate goes through the same `prepareOutsideRoutingPlan` → provider fallback → `finalizeOutsideRoutingPlan` pipeline described in `docs/OFFLINE_NAVIGATION_AND_ROUTING.md`.

Manual gate selection, once made, stays authoritative across an automatic reroute — the app does not silently override a user's explicit gate choice.

Active navigation and arrival have two live presentations: `NavigationChromeV1`/`NavigationMapLayersV1` for legacy Block destinations and `NavigationChromeV2`/`NavigationMapLayersV2` for Gate/facility destinations. Only one renders content, chosen by `sourceVersion`. A navigation or arrival UI change must land in both, or state why one is exempt (see NAV-004 in `docs/KNOWN_LIMITATIONS_AND_OWNER_ACTIONS.md`).
