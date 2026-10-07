# Product and User Flows

How the app behaves today. The source of truth is the code; this explains it. Statements are SOURCE/RUNTIME level (read from the code and covered by Jest) unless marked otherwise; EMULATOR, PHYSICAL DEVICE REQUIRED and FIELD REQUIRED claims are labelled where they appear and summarized in [`PROJECT_STATUS.md`](PROJECT_STATUS.md). Button labels below are quoted in English; all user-facing text is localizable (English, Roman Urdu, Urdu; see `ARCHITECTURE.md`).

## Principles

1. **The Directory is the one place chooser.** Finding or changing a place happens there; the Map shows and navigates.
2. **Location improves navigation, it never blocks route planning.** Without location the user still gets a full Route Guide.
3. **No fake position.** A chosen FROM is never written into `currentLocation`; live guidance needs a real, fresh, usable fix.
4. **Everything core works offline.** Launch, Directory, Map, internal routing and the Route Guide need no network.

## Launch

| Situation | Flow |
|---|---|
| Fresh install | Splash (>= 1.5 s) -> Welcome -> Directory |
| Every later launch | Splash -> Directory |
| Welcome flag unreadable | Welcome again, with a short notice saying why |

- `StartupManager.resolve({ hasSeenWelcome })` is the only routing decision. Location permission is **not** a launch gate: a user who declined or revoked it is never sent to a permission screen. Splash still reads the OS permission and its precision so approximate-only is known at launch.
- Welcome says location is optional. There is no map-download or setup step: the basemap ships in the APK and is copied and hash-verified in the background at app start ([`OFFLINE_MAP_AND_DATA.md`](OFFLINE_MAP_AND_DATA.md)).
- Splash, Welcome and Directory are reached with `replace`, so the Directory is the only route on the stack and Back leaves the app.
- Process death, force-stop, Clear Data and reinstall all start here; [`DATA_PRIVACY_RETENTION.md`](DATA_PRIVACY_RETENTION.md) lists what survives.

## Choosing a destination (Directory)

The Directory offers a search field, category chips (Blocks, Gates, Rastas, Shahr-e-Pindal), a block grid / list, and up to five Recent places (clearable). Browsing reads `PublicDestinationsService` (a sorted view of `V2PlaceAdapter`); typed search delegates to `SearchService`. It is never a second routing engine.

A tap on a destination means **take me here** (`LocationsDirectoryScreen.takeMeTo`, `planDestinationTap`):

| Situation | Result |
|---|---|
| A. Fresh usable live location | Map opens and live navigation starts by itself (fresh fix only) |
| B. Permission and precise accuracy fine, no fix yet | Map opens and finds the location (bounded); on failure the usual "choose where to start" UI stays |
| C. No usable location, a start left over from an earlier journey | Never reused: same as D. A start counts only if it is a fresh live fix or was chosen for **this** journey |
| D. No usable location, no start | Stay in the Directory: "Where are you starting from?" / "To <place>". Picking a place starts a Route Guide. "Use my location" is the one contextual permission request |
| E. Permission refused | Respected. Declining the prompt keeps the question open; Settings opens only after an explicit "Open Settings" on a permanent block |

- Approximate-only location is never treated as live. A destination that cannot be routed (for example a gate without a verified connector) opens its details instead, where the sheet says why.
- **Details** stays reachable: an info control on list rows, a long press and a TalkBack "Details" action on block tiles.
- The Directory hands Home a runtime-only `pendingJourney`; Home consumes it once focused, adds the place to Recent, opens Directions and the sheet starts the journey. A trip already under way is never replaced silently (the place is shown instead).
- Opened by an initiator (Directions "change start" / "change destination") the Directory asks that one question, stores the answer in `directoryChoice` and returns; the initiator consumes it.
- The unfinished-journey recovery card (below) is shown on the Directory.

## Place preview and details

Tapping a place on the map, or Details from the Directory, selects it: the camera focuses it (eased 600 ms, or a jump under OS reduce-motion), one pulse ring plays, and the sheet opens in its preview/details mode with Save, Share and Directions actions. Map features are layers, not TalkBack nodes; the Directory is the accessible chooser. A place that cannot be routed shows its unavailable reason (for example a gate whose connector is unverified) instead of failing silently.

## Directions setup, Route Ready and the sheet contract

Directions, route preview, the Route Guide, live navigation and arrival are modes of `HomeScreen`, not screens. **Directions setup** shows the From and To (each changeable through the Directory), calculates, and becomes **Route Ready** (time and distance, where the route starts, the primary start action). Failure, same-place and needs-a-start states are plain sentences from `src/utils/routeCopy.ts` and render from `JourneyPresentationState`.

The bottom sheet contract (`HomeScreen` + `DirectionsPeekHandle`; EMULATOR spot-checked on API 36, covered by `HomeScreen.test.tsx`):

- Three detents: **PEEK** (lowest), **PARTIAL** (default, opens here) and **FULL** (everything below the status bar). The collapsed detent clears the system navigation bar.
- **The sheet never disappears by gesture.** `enablePanDownToClose` is `false`: a swipe down only folds it to the PEEK. Leaving is an explicit control (Close / back / Cancel Route). This holds for place preview, Directions setup, Route Ready and the Route Guide.
- The handle is a single >= 48 dp button at every detent: a drag pill plus one state line (for example "Directions · Block 9 -> Block 2", "2 min · 121 m") and a chevron. A tap expands PEEK to PARTIAL and folds an open sheet back to PEEK. The handle is never swapped for another component (swapping it mid-gesture desynchronised the detent index).
- **Live navigation removes the sheet outright**: when Start Navigation runs, the sheet's content, pinned footer and container are no longer rendered or touchable (live chrome replaces it); it returns after navigation stops. Home losing focus or the drawer opening hides it too.
- At large font (>= 150%) only the primary action stays pinned; titles, summaries and the guide card scroll with the content so nothing is cut off at 200% or on a 320 dp-wide screen.
- Map controls (layers, zoom, recenter/direction) control the map only; journey actions live in the sheet they belong to.

## Live Navigation vs Route Guide

| | Live Navigation | Route Guide |
|---|---|---|
| Needs | Fresh (<= 30 s), precise, <= 50 m live fix | A chosen FROM and TO; no location |
| Gives | Current position, automatic progress, instruction advance, reroute, automatic arrival | Full route, distance, ETA, steps, map framing |
| Never | Starts from a remembered or manual position | Claims live movement, progress, reroute or arrival |
| State | `isNavigating`, recovery marker, navigation engines | `routeGuide {steps, stepIndex}` in the store: runtime only, not persisted, no marker |

- A start the user chose or saved offers **Start route** (Route Guide); "Use my location to guide me" is the secondary. The guide card shows "Your position isn't tracked. Use the steps to find your way.", Step N of M, Previous/Next, and an end-guide control. It lives in the sheet's scrollable body, and starting it opens the sheet at its top detent so the step, Previous/Next and the live-guidance link sit above a three-button navigation bar.
- A live-GPS start offers **Start Navigation**. Depending on the capability facets the primary instead reads "Use my location & start", "Turn on location & start" or "Turn on precise location" (`resolveStartAction`): the button is never a dead end, and approximate location never starts live guidance.
- Upgrading from a guide to live reuses the fresh-fix flow: acquire a real fix, recompute from the real position, start navigation, and the guide closes.
- `LocationCapability` keeps permission, accuracy, device services and fix quality separate; `liveBlocker` says why live guidance is unavailable.

## Outside the Ijtema (outside guide)

A start outside the venue is routed to an official gate first, then inside (policy and fallback order: [`NAVIGATION_AND_ROUTING.md`](NAVIGATION_AND_ROUTING.md)). When a real walking route (bundled OSM street graph, or the optional proxy) reaches the gate it is an ordinary Route Ready with the street instructions. When none does, the journey state is **OUTSIDE_VENUE_GUIDE**: the sheet says "Get to <gate> first", shows the **straight-line** distance to the gate, states that the app guides inside the Ijtema area, offers Retry and a gate choice ("Closest gate" or a specific verified gate; a manual gate stays authoritative across reroutes), and the primary action reads "Start walking". The folded handle never shows a walking-looking total for it. The straight line is not a walking distance and the selection cost is never shown as one.

## The Map

- **Top bar:** `<- Places` (pushes the Directory over the Map; Back returns), what the map shows (place name, Directions, Route guide) and the menu. The menu (drawer) lists Find a place, Settings and Help; About opens from Settings. No search field, no browse chips, no bottom navigation. The bar is absent in live navigation and arrival.
- **Map controls:** layers/filters, zoom in/out and a More group (recenter, direction), all controlling the map only.
- **Camera on entry:** a destination or route owns the camera; otherwise a live fix shows the venue overview with the user marker, and no usable location shows the Block 2 anchor with a plain notice ("We can't find where you are. Showing the main area."). A persisted last-known location never moves the camera on its own.
- **Attribution:** the map's own attribution control carries "(c) OpenStreetMap contributors" and is kept clear of sheets and the navigation bar; a link chip also shows when the displayed route came from the bundled OSM street graph.

## Navigation, arrival and what follows

1. Start Navigation (or auto-start from a destination tap) enters navigation mode and writes the coordinate-free recovery marker.
2. While navigating: instruction card (spoken if Voice Instructions is on and not muted), progress, ETA, reroute when off route, GPS-lost and weak-GPS notices. Details: [`NAVIGATION_AND_ROUTING.md`](NAVIGATION_AND_ROUTING.md).
3. Arrival uses proximity to the destination entry coordinate (within 20 m) **and** progress along the route reaching its end, so an earlier leg passing near the destination does not end the trip. Once reported it stays latched. Only the engine that owns the session may arrive (V2 route -> `NavigationViewModelV2`; the V1 engine cannot arrive during a V2 trip and V2 never runs for a V1 route).
4. Arrival clears the recovery marker. **Done** resets the stack to the Directory alone, like a launch: Back from it leaves the app, and picking the next destination opens a fresh Map. Mid-trip **Exit** asks for confirmation (the Android back button shares that handler), stops navigation and stays on the Map.
5. **Recovery of an unfinished journey.** If the process dies during live navigation, the next launch lands on the Directory with a "Your last navigation didn't finish" card (valid for 2 h from when navigation started). Nothing resumes by itself and no position is stored: **Get new route** plans a fresh journey to the same destination, **Dismiss** clears the marker. Route Guide, previews and arrival leave no recovery card. EMULATOR verified (`am kill` -> relaunch -> card -> Get new route); real low-memory kills are PHYSICAL DEVICE REQUIRED.

Start source (GPS, search, map tap, remembered state) never changes routing policy. A manual gate selection stays authoritative across an automatic reroute.

## Share

The place sheet's **Share** action opens the system Sharesheet (`Share.share`) with `buildPlaceShareMessage` (`src/utils/placeShare.ts`):

```
📍 <place name> — <share heading>
https://www.openstreetmap.org/?mlat=<lat>&mlon=<lon>#map=19/<lat>/<lon>
```

- One tappable link, no raw coordinates written as text (they are only inside the link), no Google SDK/API/key. A place without a usable coordinate shows "Place unavailable" instead.
- **No App Link exists.** There is no verified owned domain and no URL scheme to claim, so the link is a plain OpenStreetMap URL that opens in any browser or map app. The app does not pretend a deep link works, and receiving a shared link does not open this app.
- **Future App Link path (not built):** (1) the owner provides and verifies a domain; (2) publish `/.well-known/assetlinks.json` for package `com.aicrafted.karachiijtema` with the release signing certificate fingerprint; (3) add an Android intent filter with `android:autoVerify="true"` for that domain and handle the incoming route; (4) change only `url` in `buildPlaceShareMessage`. Signing and domain facts are owner-provided; none is verified here.

## Settings, language and help

Settings (drawer -> Settings) contains, in order:

- **Language** (radio list): English, Roman Urdu, اردو. Each is shown in its own script and is never translated. The choice is saved on the device (`ijtema-locale-v1`) and applies at once, including right-to-left layout for Urdu; the first launch follows the phone when it is Urdu, otherwise English.
- **Navigation:** Voice Instructions (on by default; speaks each turn) and Distance Unit (meters or feet).
- **Location:** shows the state (On / Off / Checking) and a Manage action that asks for permission or opens the phone's settings as needed.
- **Privacy:** Clear Recent Searches, Clear Saved Location, Clear unfinished journey (targeted; see [`DATA_PRIVACY_RETENTION.md`](DATA_PRIVACY_RETENTION.md)).
- **Help:** App Guide, and About (version, Privacy Policy and Terms links, map data attribution). The Privacy Policy and Terms URLs are unset placeholders (owner-provided, #47): tapping them says the link isn't ready.
- A hidden Developer Mode exists only in development builds.

Older builds had settings for voice language, keeping north up and auto-follow; those controls were removed and nothing reads them from the UI. The App Guide is static, offline content. The Help screen is static too, with tap-to-call emergency numbers and an official-website link that is still an unset placeholder (tapping it says the link isn't ready).
