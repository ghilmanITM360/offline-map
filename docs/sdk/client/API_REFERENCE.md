# API reference

Types are in the package's `.d.ts`; this page is the behavioural contract. Every claim here is covered by the package's tests.

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
| `ingestFix(fix)` / `tick()` / `resume()` | Live plumbing: `ingestFix` is wired to the adapter's watcher on live start; `tick` ~1/s re-checks GPS loss (the provider does this); `resume` after foreground. |
| `exit()` / `dispose()` | End the trip / release everything. Both idempotent. You own the controller's lifetime. |

Guarantees (tested): one trip = one session, so a superseded, post-Exit, post-arrival or post-dispose answer can never commit; weak
or untimestamped fixes freeze movement; GPS is "lost" after 8 s; one reroute at a time and the old route is kept when none is
found; arrival (within 20 m of the destination on the final step) is latched and cancels the session so nothing can reroute after
it; cached fixes delivered after a resubscribe are ignored; one observation counts once.

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
| `copy` (required) | Every string. `ENGLISH_NAVIGATION_SCREEN_COPY` is optional and separate; no Urdu/Roman Urdu ships. |
| `theme` (required) | One object: colours, radius, icons, `Button`. `createDefaultNavigationTheme({ isRTL, colorScheme })` is ready-made (light/dark, View-drawn icons). |
| `isRTL` (required) | Text flow direction only. The map and Recenter keep their physical layout. |
| `describePlace` | Names a place or returns `null` to hide it; without it the place id is shown (never an invented name). |
| `MapComponent` | Your map, or `createMapLibreNavigationMap(...)`. Omit for a directions-only screen. |
| `allowLive` | Default true. |
| `bottomInset` | Safe-area bottom inset for the arrival sheet. |
| `onClose`, `onTripEnded('exit'\|'arrived')`, `style` | Navigation hooks; `style` goes on the root so you add safe-area padding. |

The screen owns the journey UI (directory and search, start chooser, preview, Manual Guide, explicit Live, GPS weak/lost, reroute,
arrival, Exit, Recenter) and holds no navigation state of its own.

### `NavigationMapProps` (what a custom map receives)

`phase`, `route`, `originId`, `destinationId`, `position` (snapped live position), `stepIndex`, `onAvailabilityChange(boolean)`,
and a `ref` answering `recenter()`. A map renders what it is given and decides nothing.

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
