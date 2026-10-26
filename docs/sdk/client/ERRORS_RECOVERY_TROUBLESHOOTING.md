# Errors, recovery and troubleshooting

## Live blockers (`state.liveAttempt.blocker`)

Each has a sentence in `copy.liveBlockers`. None of them end the journey: the preview and Manual Guide stay.

| Blocker | Meaning | Host action |
| --- | --- | --- |
| `permission_needed` | Not granted, can ask | Nothing; the prompt is the user's explicit request. |
| `permission_blocked` | Denied permanently | Offer a Settings shortcut; Manual Guide still works. |
| `approximate_only` | Reduced/coarse precision | Ask the user to enable precise location. |
| `precision_unknown` | Precision cannot be proven | **iOS without a native precision check** (see Integration §6). Never guess it. |
| `services_off` | Location services disabled | Offer the system location settings. |
| `no_fix` / `stale_fix` / `weak_fix` | No usable fresh fix (none, older than 30 s or in the future, or worse than 50 m) | Retry; the SDK never uses a remembered position. (`acquiring` is a transient capability state shown as "Checking your location…", not a start blocker.) |
| `outside_venue` | Fix further than `maxLiveSnapDistanceM` from any node and no `outside` provider (or it returned a `directGuide`) | Provide an `OutsideRouteProvider`, or keep Manual Guide. |
| `route_outdated` | The walker moved more than 20 m between `prepareLive()` and `confirmLive()` | Prepare the live route again from where they stand. |
| `route_pending` | A route is still loading | Wait. |
| `unsupported` | The controller was created without a `location` adapter | Provide one, or hide Live (`allowLive={false}`). |
| `already_at_destination` / `no_route` | The live position is at the destination / no route from it | Show the message; Manual Guide stays. |

## Journey states

- **GPS weak/lost:** movement, arrival and reroute evidence freeze; lost after 8 s without an accepted fix; recovery is automatic
  when fixes return.
- **Reroute:** automatic, one at a time; if none is found the old route is kept and the user is told.
- **Arrival:** latched; nothing can replace the route afterwards. **Exit:** always available and idempotent.
- **`state.error`** is one of `unknown_place`, `no_route`, `route_failed` (retry offered for failures); the screen also handles "same place" and "choose a start" itself.

## Map and basemap

- Missing, partial or corrupt archive → install replaces it from the bundle; if that fails pass `archiveUri: null`
  (plain canvas + "directions still work"); offer retry. Verified on iOS (corrupt same-size file and deleted file both healed).
- A failed style load reports `onAvailabilityChange(false)`; the route still draws over the canvas.

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| Android emulator window turns black when the map mounts | The emulator's software renderer (SwiftShader). Start it with `-gpu host`; a real device is unaffected. |
| Route preview zoomed far out on Android | Old adapter default reserved 300 dp for the panel; fixed in this build (default 56). Hosts that overlay their own panel pass `bottomPadding`. |
| Urdu locale but layout stays LTR on iOS | Missing `ur` in `CFBundleLocalizations`. |
| Chevrons point the wrong way in RTL | Custom icons that are bidi glyphs; use drawn icons pinned `direction: ltr`. |
| Live refuses on iOS with "could not confirm precise location" | No native precision reader supplied. |
| Android status-bar icons invisible | Use `expo-status-bar` `style="auto"` under edge-to-edge. |
| Last list item hidden under the Android navigation bar | Use real safe-area insets for padding; the list scrolls. |
| Release build fails in the Metro bundle phase from a temp path | Export real (`/private/tmp`) `PROJECT_ROOT` and `ENTRY_FILE`. |
| `npm ls` reports `react@19.1.0` invalid | Known test-renderer/react-reconciler peer mismatch from the test tooling, not the SDK. |
| Metro bundle contains two Reacts | A duplicate install; the consumer driver fails on this. |
