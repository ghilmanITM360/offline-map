# Product and User Flows

How the app behaves today. Source of truth is the code; this explains it. Statements describe source and automated behavior unless separately cited. Native runtime verification for the current candidate remains unperformed.

## Principles

1. **The Directory is the one place chooser.** Finding or changing a place happens there; the Map shows and navigates.
2. **Location improves navigation, it never blocks route planning.** Without location, a valid route and explicit current-journey manual origin allow Route Guide.
3. **No fake position.** A chosen FROM is never written into `currentLocation`; live guidance needs a real, fresh, usable fix.
4. **Everything core works offline.** Launch, Directory, Map, internal routing and the Route Guide need no network.

## Launch

| Situation | Flow |
|---|---|
| Fresh install | Splash (>= 1.5 s) -> Welcome -> Directory |
| Every later launch | Splash -> Directory |
| Welcome flag unreadable | Welcome again, with a short notice saying why |

- `StartupManager.resolve({ hasSeenWelcome })` is the only routing decision. Location permission is **not** a launch gate: a user who declined or revoked it is never sent to a permission screen. Splash still reads the OS permission and its precision so approximate-only is known at launch.
- Welcome says location is optional. There is no map-download or setup step: the basemap ships in the APK and is copied and hash-verified in the background at app start (`docs/OFFLINE_BASEMAP.md`).
- Splash, Welcome and Directory are reached with `replace`, so the Directory is the only route on the stack and Back leaves the app.
- Process death, force-stop, Clear Data and reinstall all start here; see `docs/DATA_RETENTION.md` for what survives.

## Choosing a destination (Directory)

A tap on a destination creates a new runtime journey identity and opens its destination panel on Map (`LocationsDirectoryScreen.takeMeTo`):

| Situation | Result |
|---|---|
| A. Fresh usable live location | Map opens and live navigation starts by itself (fresh fix only) |
| B. Permission granted, no usable fix | Map opens with destination context; origin resolution offers contextual location acquisition or manual selection |
| C. No usable location, a start left over from an earlier journey | Never reused: same as D. A start counts only if it is a fresh live fix or was chosen for **this** journey |
| D. No usable location, no start | Map opens with the destination. Choose a starting point, use location, or preview hypothetically from Block 2. A valid explicit manual origin enables Route Preview then Route Guide |
| E. Permission refused | Respected. Declining the prompt keeps the question open; Settings opens only after an explicit "Open Settings" on a permanent block |

- Approximate-only location is never treated as live. A destination that cannot be routed opens its details instead.
- **Details** stays reachable: an info control on list rows, a long press and a TalkBack "Details" action on block tiles.
- The Directory hands Home a runtime-only `pendingJourney`; Home consumes it once focused, adds the place to Recent, opens Directions and the sheet starts the journey. A trip already under way is never replaced silently (the place is shown instead).
- The recovery card's "Get new route" plans the journey exactly like a destination tap.

## Live navigation vs Route Guide

| | Live navigation | Route Guide |
|---|---|---|
| Needs | Fresh, usable, precise live fix | A chosen FROM and TO |
| Gives | Current position, automatic progress, instruction advance, reroute, automatic arrival | Full route, distance, ETA, steps, map framing |
| Never | Starts from a remembered or manual position | Claims live movement, progress, reroute or arrival |
| State | `isNavigating`, recovery marker, nav engines | `routeGuide {steps, stepIndex}` in the store: runtime only, not persisted, no marker |

- A start the user chose or saved offers **Start route** (Route Guide); **Use my location for live guidance** is the secondary. The Route Guide card shows "Your position isn't tracked. Use the steps to find your way.", Step N of M, Previous/Next, and End route guide.
- Upgrading an existing guide requires user confirmation, fresh acquisition, private replacement calculation, replacement preview and explicit Start live navigation. Failure or cancellation preserves the original guide, start, destination, route and selected step. This differs from guarded automatic activation after a new destination tap.
- The capability model (`LocationCapability`) keeps permission, accuracy authorization (precise/approximate), device services and fix quality separate. Live guidance is available only with no blocker; a valid route and explicit current-journey manual origin enable Route Guide.

## Temporary Directory chooser and Block 2

An origin chooser is owned by journey identity, destination, purpose and request generation. Cancel/Back invalidates that request and returns to the same Map journey. A late response cannot affect a newer journey, even for the same destination. Normal browsing retains query/category, selected item and a stable-ID/geometry scroll anchor; chooser filters stay private. Changed datasets resolve a safe clamped position rather than blindly replaying a pixel offset. Logical native accessibility focus remains unfinished.

Block 2 is resolved from canonical venue data and remains explicitly hypothetical until the user confirms being there. It never writes currentLocation or authorizes movement, route progress, rerouting, GPS arrival or automatic live navigation. Confirmation creates a current-journey manual origin, not a GPS observation. New journeys do not reuse the preview; Block 2 to Block 2 is SAME_PLACE. Later GPS acquisition follows a truthful current-location path.

## The Map

- **Top bar:** `<- Places` (pushes the Directory over the Map; Back returns), what the map shows (place name, Directions, Route guide), and the menu (Settings, Help, About). No search, no browse chips, no bottom navigation. Absent in live navigation and arrival.
- **One map, one sheet:** Directions, route preview, the Route Guide, live navigation and arrival are modes of `HomeScreen`, not screens. `LocationSheet` has `details`, `preview` and `routePreview` modes.
- **Directions handle:** the sheet's handle is always a tappable peek (state line + chevron, >= 48 dp) that expands the sheet when collapsed and folds it when open. The collapsed detent is computed to clear the system navigation bar, so the peek is never behind it. The handle is never swapped, which keeps the sheet's detent index in sync.
- **Route Guide placement:** the guide card (step, Previous/Next, "Use my location for live guidance", "End route guide") lives in the sheet's scrollable body, so it stays reachable on short screens, at large font and behind a three-button bar. Explicitly activating the guide requests the top detent so its controls can be reached. The expansion request is repeated after the sheet reports landing to handle sheet-opening timing; this does not authorize automatic manual-guide activation. Actual native geometry and large-font reachability remain unverified for this candidate.
- **Map controls** (Direction, Recenter, More = Layers and Zoom) control the map only; journey actions live in the sheet they belong to (Cancel Route, End route guide, Close).
- **Camera on entry:** a destination or route owns the camera; otherwise a live fix shows the venue overview with the user marker, and no usable location shows the Block 2 anchor with "Location unavailable. Showing Block 2." A persisted last-known location never moves the camera on its own.

## Navigation, arrival and what follows

1. Start Navigation (or auto-start from a destination tap) enters navigation mode and writes the coordinate-free recovery marker.
2. Arrival uses proximity to the destination entry coordinate (within 20 m) **and** progress along the route reaching its end, so an earlier leg passing near the destination does not end the trip. Once reported it stays latched. **Only the engine that owns the session may arrive:** a V2 route (Gate/facility destinations, the current flows) belongs to `NavigationViewModelV2`; the legacy V1 engine cannot produce arrival during a V2 trip, and V2 never runs for a V1 route.
3. Arrival clears the recovery marker. **Done** resets the stack to the Directory alone, like a launch: Back from it leaves the app, and picking the next destination opens a fresh Map. Mid-trip **Exit** stops navigation and stays on the Map.
4. Process death during live navigation: the next launch lands on the Directory with a "Your last navigation didn't finish" card (2 h from when navigation started). Nothing resumes by itself; **Get new route** plans a fresh journey, **Dismiss** clears the marker. Route Guide, previews and arrival leave no recovery card.

Start-source (GPS, search, map tap, remembered state) never changes routing policy: every outside coordinate goes through `prepareOutsideRoutingPlan` -> provider fallback -> `finalizeOutsideRoutingPlan` (`docs/OFFLINE_NAVIGATION_AND_ROUTING.md`). A manual gate selection stays authoritative across an automatic reroute.

Active navigation and arrival have two presentations, `NavigationChromeV1`/`NavigationMapLayersV1` (legacy Block destinations) and `NavigationChromeV2`/`NavigationMapLayersV2` (Gate/facility destinations); only one renders, chosen by `sourceVersion`. A navigation or arrival UI change must land in both, or state why one is exempt (NAV-004 in `docs/KNOWN_LIMITATIONS_AND_OWNER_ACTIONS.md`).
