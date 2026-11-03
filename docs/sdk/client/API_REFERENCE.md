# API reference

Types are in the package's `.d.ts`; this page is the behavioural contract. Every claim here is covered by the package's tests.

## Package exports

| Specifier | What it is |
| --- | --- |
| `@muslim-ummah/offline-navigation` | headless domain (below) |
| `…/session` | `createNavigationSession` |
| `…/ui` | provider, hooks, `NavigationScreen`, leaf cards, theme, English copy |
| `…/maplibre` | `createMapLibreNavigationMap`, `buildOfflineBasemapStyle` |
| `…/app.plugin.js` | the Expo config plugin (build time; referenced by name in `app.json`: `"@muslim-ummah/offline-navigation"`). Options: `locationPermissionText`, `languages`, `maplibre`, `androidFontScaleFix` ([QUICK_START.md](QUICK_START.md) step 3) |
| `…/metro` | `withOfflineNavigation(metroConfig)` and `ASSET_EXTENSIONS` (`pmtiles`, `packfile`); build time, typed by `metro.d.ts` |
| `…/package.json` | the manifest |

Nothing else is importable: `…/dist/…` paths are refused (`ERR_PACKAGE_PATH_NOT_EXPORTED`).

## Headless: `@muslim-ummah/offline-navigation`

### `createNavigationController(options): NavigationController`

```ts
createNavigationController({
  venue,            // VenueDataSource: graph + places (required)
  location,         // NavigationLocationAdapter (optional; without it Live is reported unsupported)
  now,              // () => epoch ms (required with `location`; the SDK reads no clock)
  findRoute,        // optional async RouteFinder replacing the default synchronous offline A*
  createSessionId,  // optional trip ids
  walkingSpeedMps,  // default 1.4
  autoReroute,      // default true
  maxLiveSnapDistanceM, // default 100: a live fix further than this from any venue node is "outside the venue"
  outside,          // optional OutsideRouteProvider: routes for a walker outside the venue (see below)
});
```

| Method | Behaviour |
| --- | --- |
| `getState()` / `subscribe(l)` | Referentially stable snapshot (safe for `useSyncExternalStore`). |
| `listPlaces()` | Every routable place, in venue order (same array each call). |
| `selectDestination(id)` | Starts a new trip; a manual origin is kept and the route recomputed. Unknown ids are reported in `state.error`. |
| `selectOrigin(id)` | Manual start. Ignored before a destination and while live. |
| `startGuide()` / `nextStep()` / `previousStep()` | Manual Guide. Needs no GPS. |
| `requestLive()` | **The only way live navigation starts.** Prompts for permission only because the user asked, requires precise location, a fresh timestamped fix and a position inside the venue, then routes from the snapped position. Resolves `true` when Live began; every refusal is a typed `state.liveAttempt.blocker` and leaves the journey untouched. |
| `prepareLive()` → `confirmLive()` / `cancelLive()` | The two-step start the Ijtema host uses. `prepareLive()` does everything `requestLive()` does except commit: it leaves `state.liveCandidate` (the route and ETA) with `liveAttempt.status === 'candidate'`, no watcher and the Manual Guide untouched. `confirmLive()` re-reads permission (never prompts), takes a **fresh** fix and starts Live only if it is usable and within 20 m of where the candidate was prepared (else `route_outdated`, `stale_fix`, `weak_fix`, `permission_*`, `no_fix`). Selecting another destination/origin/gate, Exit or `cancelLive()` retires the candidate; a late answer can never revive it. `<NavigationScreen>` uses this flow unless `reviewLiveRoute={false}`. |
| `requestReroute()` | Explicit "route me again now" from the last accepted position: ignores `autoReroute` and the cooldown, supersedes a reroute in flight. `false` when not live. |
| `listEntryGates()` / `selectEntryGate(id)` | Entry gates offered by the outside provider; the chosen gate is passed to it. Kept for a new origin, reset by a new destination; a prepared live route is retired; while live it reroutes now. |
| `ingestFix(fix)` / `tick()` / `resume()` | Live plumbing: `ingestFix` is wired to the adapter's watcher on live start; `tick` ~1/s re-checks GPS loss (the provider does this); `resume` after foreground. |
| `exit()` / `dispose()` | End the trip / release everything. Both idempotent. You own the controller's lifetime. |

Guarantees (tested): one trip = one session, so a superseded, post-Exit, post-arrival or post-dispose answer can never commit; weak
or untimestamped fixes freeze movement; GPS is "lost" after 8 s; one reroute at a time and the old route is kept when none is
found; arrival (within 20 m of the destination on the final step) is latched and cancels the session so nothing can reroute after
it; cached fixes delivered after a resubscribe are ignored; one observation counts once. `resume()` also asks the adapter for one fresh fix
(through `getCurrentFix`, aborted on Exit) so the walker is not left on a stale position while the watcher reacquires.

### `OutsideRouteProvider` (optional, you implement)

```ts
entryGates?: { id; label }[]                           // what selectEntryGate() accepts
route({ from, destination, entryGateId, signal }): OutsideRoute | null | Promise<OutsideRoute | null>
// OutsideRoute = { points: VenueCoordinate[]; steps: RouteStep[] /* ends in 'arrive' */; directGuide?: boolean }
```

Without a provider a live fix outside the venue is refused (`outside_venue`). With one, the controller asks it for the walker's whole
route (street part, gate, venue part), **validates it as untrusted input** (at least two finite points, steps ending in `arrive`
whose distances agree with the polyline within 2 % or 5 m; anything else is `no_route`) and then tracks it like any route. `null`, a
throw or a rejection is `no_route`; a route with `directGuide: true` can be shown by your own UI but can **never** start Live
(`outside_venue`). The same provider serves rerouting while the walker is outside; once a fix is near a venue node the venue graph
takes over. The SDK builds no street route itself; Gates without verified connectivity are simply not in your `entryGates`.

### `NavigationLocationAdapter` (you implement)

```ts
getPermission(): Promise<{ granted; canAskAgain; precision?: 'fine'|'coarse'|'none'; servicesState?: 'enabled'|'disabled'|'unknown' }>  // never prompts
requestPermission(): Promise<same>                      // the only prompt; called only from requestLive()
getCurrentFix(signal: AbortSignal): Promise<{ latitude; longitude; accuracy?; observedAtMs? } | null>  // one FRESH fix, never last-known
watch(onFix): () => void                                // continuous fixes; returns stop
```

Map precision honestly: `'fine'` only for full precision (Android fine, iOS full accuracy). `'none'` with a granted permission means
"not read yet" and refuses Live as `precision_unknown`. A fix is usable only if timestamped, no older than 30 s, not in the future and
accurate to 50 m or better.

### Behaviour guarantees added after the independent audit

- `resume()`: only the newest call decides; an older one finishing late changes nothing. A watcher the trip no longer owns is ignored even if the adapter keeps calling it.
- `ingestFix`: observation time only moves forward per trip; a duplicate, older or replayed fix is ignored, so it cannot refresh GPS, move progress or count towards a reroute.
- `requestLive()`: re-reads permission and, when the route search took more than 5 s or the fix is no longer live, takes a new fix that must be within 20 m of where the route was made (`route_outdated` / `stale_fix` otherwise).
- `OutsideRouteProvider.route()`: its polyline must start within 100 m of `from` and end within 25 m of a node of the chosen destination, else it is `no_route` (also on a reroute).
- Subscribers may call `exit()`, `dispose()` or `selectDestination()` from inside a notification; the controller re-checks ownership after every publish. `dispose()` also resets `getState()` to browsing.
- `repairPointer()` (pack manager) rebuilds the pointer from verified installed directories instead of discarding them.
- `heuristicScale(graph)` (venue routing) is the cached lower-bound factor used for the straight-line estimate; `useSafetyAnnouncements` and the optional `copy.live.gpsRecovered` are exported from `/ui`.
- `createNodePackFileSystem(root, { requireCurrentUser? })` (reference adapter, repository scripts) refuses symbolic links at every path component.

### Other headless exports

`findBestVenuePath` / `runAStar` / `MinHeap` (offline routing), `buildRouteSteps`, `buildRouteLine`, `advanceProgress`,
`projectOnRoute`, `locateStep`, `isArrivedAtDestination`, `shouldTriggerReroute`, `evaluateLocationCapability`,
`classifyLiveFix`, `parsePackManifest`, `verifyPack`, `checkPackCompatibility`, `createPackManager` (see
[../OFFLINE_PACK_SPEC.md](../OFFLINE_PACK_SPEC.md)), `createNavigationSession` (also at `/session`).

## UI: `@muslim-ummah/offline-navigation/ui`

### `<NavigationProvider controller lifecycle? tickMs?>`

Binds one controller to React, drives the GPS-loss clock only while live, and resumes live navigation when `lifecycle.onForeground`
fires. It owns no navigation state. Hooks: `useNavigationController()`, `useNavigationState()`.

### `<NavigationScreen>` props

| Prop | Meaning |
| --- | --- |
| `copy` (required) | Every string. `ENGLISH_NAVIGATION_SCREEN_COPY` is optional and separate; no Urdu/Roman Urdu ships. `copy.entryGate` (optional) is the wording of the entry-gate chooser: without it the screen never shows one. |
| `theme` (required) | One object: colours, radius, icons, `Button`, and `colorScheme` (`'light' \| 'dark'`, default light) which picks the map's palette. `createDefaultNavigationTheme({ isRTL, colorScheme })` is ready-made (light/dark, View-drawn icons) and sets it. Changing the theme restyles the screen and the map **in place**: the trip, the step and the camera are untouched. |
| `isRTL` (required) | Text flow direction only. The map and Recenter keep their physical layout. |
| `describePlace` | Names a place or returns `null` to hide it; without it the place id is shown (never an invented name). |
| `MapComponent` | Your map, or `createMapLibreNavigationMap(...)`. Omit for a directions-only screen. |
| `allowLive` | Default true. |
| `bottomInset` | Safe-area bottom inset for the panel, default 0. Pass `insets.bottom` when the screen is the bottom-most thing on the page and `0` when your own bar sits below it and already clears the system bar. |
| `arrivalBottomInset` | Bottom inset for the arrival sheet, default `bottomInset`. The sheet is a Modal window that draws under the system navigation bar, so pass `insets.bottom` here even when `bottomInset` is `0`. |
| `onClose`, `onTripEnded('exit'\|'arrived')`, `style` | Navigation hooks; `style` goes on the root so you add safe-area padding. |

The screen owns the journey UI (directory and search, start chooser, preview, Manual Guide, explicit Live, entry-gate chooser, GPS weak/lost,
reroute, arrival, Exit, Recenter) and holds no navigation state of its own.

**Large text.** From a system font scale of 1.3 (`LARGE_TEXT_SCALE`) the panel changes shape instead of growing: in the directory the heading and
search field scroll with the list (so the places can always be reached), and in the Manual Guide and Live the step controls, End and Exit are pinned under
the scrolling content (testID `navigation-pinned`). Headings stop growing at 1.8x (`HEADING_MAX_FONT_SCALE`); instructions, rows and buttons scale
fully and nothing is truncated. A system text-size change mid-journey keeps the trip, the step and the search text.

**Entry gates.** When the controller's `outside` provider lists `entryGates` **and** `copy.entryGate` is set, the screen shows a chooser (a "Let the app
choose" option plus one button per gate, the chosen one exposed as selected) in the preview, under a live candidate and while live. A choice is one
`controller.selectEntryGate(id)` call (`null` for "Let the app choose"); a prepared live route is retired, while live the route is recomputed, and a new
destination or Exit clears the choice. A gate the provider does not list (for example Gates 18 and 19, which have no verified connection) is not shown
and cannot be chosen.

### `NavigationMapProps` (what a custom map receives)

`phase`, `route`, `originId`, `destinationId`, `position` (snapped live position), `stepIndex`, `onAvailabilityChange(boolean)`,
`colorScheme` (the theme's appearance; switching it must restyle in place, never remount or move the camera) and a `ref` answering `recenter()`.
A map renders what it is given and decides nothing.

## Map: `@muslim-ummah/offline-navigation/maplibre`

```ts
const NavigationMap = createMapLibreNavigationMap({
  venue, archiveUri /* file:// PMTiles or null */, archiveZoom: { min, max },
  initialCenter, initialZoom,
  colors?, bottomPadding? /* default 56 dp: clears Recenter; the screen already lays the map above its panel */,
  attributionBottomInset? /* default 8 */, followZoom? /* default 17 */,
});
// create ONCE per archive, outside render, so the component keeps a stable identity
```

The style has one local vector source and **no** glyphs, sprite or remote URL, so a render cannot reach for the network. A null
archive or a failed style load draws a plain canvas and reports `onAvailabilityChange(false)` (the screen then says directions still
work). OpenStreetMap attribution stays visible. Expected source layers: `landuse`, `water`, `buildings`, `roads` (`class`: path,
minor, major).

**Dark map.** `colorScheme="dark"` (from the theme) swaps to `BASEMAP_COLORS_DARK` and `DEFAULT_MAP_COLORS_DARK`: the same layers and sources, the same
single local archive, still no glyphs, sprite or remote URL. Roads and paths are at least 3:1 against the land and the route, origin, destination and
walker at least 3:1 (tested). Both styles are built once; switching changes the style object and the overlay paints only. `colors` overrides the overlay for
both appearances. `buildOfflineBasemapStyle(archive, zoom, platform, scheme)` takes the scheme as a fourth argument (default `'light'`, so existing hosts are
unchanged).

**Camera browsing.** While Live the map follows the walker. A deliberate pan or zoom (a MapLibre region change with `userInteraction: true`; the adapter's own
camera moves are reported as programmatic and are ignored) stops the following and leaves the user's view alone; the walker marker keeps moving and the
controller is untouched. Recenter, a new route or a new phase follows again.
