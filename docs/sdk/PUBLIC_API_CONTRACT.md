# Proposed SDK public API

All names below are proposals, not existing exports. Stable primitives use `{latitude, longitude}` in degrees; adapters convert legacy `{lat,lng}` and MapLibre `[longitude,latitude]` explicitly. IDs are opaque venue-scoped strings, retaining existing canonical IDs unchanged. Public objects are immutable snapshots, never Zustand setters or refs.

```ts
type Language = 'en' | 'ur-Latn' | 'ur';
type Coordinate = Readonly<{ latitude: number; longitude: number }>;
type PlaceRef = Readonly<{ venueId: string; placeId: string }>;
type VenueMetadata = Readonly<{
  venueId: string; packVersion: string; schemaVersion: number;
  title: string; languages: readonly Language[];
}>;
type ErrorCode = 'cancelled' | 'disposed' | 'busy' | 'invalid-input'
  | 'venue-unavailable' | 'pack-incompatible' | 'pack-integrity'
  | 'permission-blocked' | 'fix-unusable' | 'no-route'
  | 'stale-preview' | 'native-unavailable' | 'internal';
type NavigationError = Readonly<{
  code: ErrorCode; messageKey: string; retryable: boolean;
  requestId?: string; // sanitized; no secrets, coordinates or stack by default
}>;
type Result<T> = { ok: true; value: T } | { ok: false; error: NavigationError };
type CommandOptions = { signal?: AbortSignal };
type DestinationIntent = 'preview-only' | 'automatic-live-if-eligible';
type EntryGateSelection = { kind: 'automatic' } | { kind: 'manual'; gate: PlaceRef };
type Origin =
  | { kind: 'current-location' } // SDK obtains/revalidates usable fix
  | { kind: 'manual-place'; place: PlaceRef }
  | { kind: 'manual-coordinate'; coordinate: Coordinate }
  | { kind: 'hypothetical-block-2' }; // Ijtema policy extension, not generic default
// Raw host coordinates cannot confer GPS authority.
type RoutePreview = Readonly<{
  previewId: string; journeyId: string; venue: VenueMetadata;
  classification: 'internal-walk' | 'outside-walk' | 'direct-guide'
    | 'same-place' | 'unavailable';
  canStartManual: boolean; canStartLive: boolean;
  warnings: readonly string[];
}>;
type Capability = Readonly<{
  permission: 'granted' | 'denied' | 'not-requested' | 'unknown';
  accuracyAuthorization: 'precise' | 'reduced' | 'unknown';
  services: 'enabled' | 'disabled' | 'unknown';
  liveAllowed: boolean; blocker?: string;
}>;
type Snapshot = Readonly<{
  revision: number; venue: VenueMetadata | null; journeyId: string | null;
  stage: 'idle' | 'needs-origin' | 'calculating' | 'preview' | 'manual'
    | 'live' | 'arrived' | 'error' | 'suspended';
  destination: PlaceRef | null; preview: RoutePreview | null;
  capability: Capability; directions: 'closed' | 'peek' | 'partial' | 'full';
}>;
type NavigationEvent =
  | { type: 'snapshot'; snapshot: Snapshot }
  | { type: 'route-ready'; preview: RoutePreview }
  | { type: 'error'; error: NavigationError }
  | { type: 'arrival'; journeyId: string; destination: PlaceRef }
  | { type: 'exit'; journeyId: string | null; reason: 'user' | 'venue-switch' | 'disposed' };
type InstalledPackRef = Readonly<{ venueId: string; packVersion: string }>;
interface NavigationController {
  loadVenue(pack: InstalledPackRef, options?: CommandOptions): Promise<Result<VenueMetadata>>;
  getSnapshot(): Snapshot;
  subscribe(listener: (event: NavigationEvent) => void): () => void;
  selectDestination(place: PlaceRef, intent: DestinationIntent): Result<void>;
  selectEntryGate(selection: EntryGateSelection): Result<void>;
  previewRoute(origin: Origin, options?: CommandOptions): Promise<Result<RoutePreview>>;
  confirmManualOrigin(previewId: string): Result<void>;
  startManualGuide(previewId: string): Result<void>;
  startLiveNavigation(previewId: string, options?: CommandOptions): Promise<Result<void>>;
  prepareLiveUpgrade(options?: CommandOptions): Promise<Result<RoutePreview>>;
  confirmLiveUpgrade(previewId: string, options?: CommandOptions): Promise<Result<void>>;
  requestLocationCapability(options?: CommandOptions): Promise<Result<Capability>>;
  refreshLocationCapability(options?: CommandOptions): Promise<Result<Capability>>;
  openLocationSettings(): Promise<Result<void>>;
  presentDirections(detent: 'peek' | 'partial' | 'full'): Result<void>;
  cancelSession(): Result<void>;
  exit(): Result<void>;
  setPresentationActive(active: boolean): Result<void>;
  dispose(): void;
}
```

`createOfflineNavigation({adapters, locale, theme, outsidePolicy})` returns a controller (initial venue null). Internal adapter bundle contracts for location, filesystem, storage, clock, speech and optional outside-provider transport are not arbitrary host navigation plugins. Define their typed test ports during B2–B4; default Expo implementation owns native subscriptions. No global GPS watcher is installed by initialization. A shared app-runtime location resource arbiter grants only one live owner across controllers; a second live or upgrade owner returns busy. Adapter access for permission/fix acquisition is serialized without sharing mutable journey state. SDK-created controllers in the same runtime register with the same arbiter; injected test adapters must implement the same exclusivity contract. Release occurs on blur, cancellation, exit or dispose; failed acquisition leaves existing guide intact. Loading requires a verified installed pack; a later `PackManager` imports/downloads/verifies packs separately. Venue metadata is available through snapshots and load result. Public preview is an opaque authorization handle; geometry/instructions become read-only typed presentation data at B4, not host-editable route authority.

Proposed React bindings: `OfflineNavigationProvider({controller, locale, theme, children})`, `useOfflineNavigation()` (commands + immutable snapshot), `OfflineNavigationView({onExitRequested, onFatalError})`, and `VenueDirectory({onDestinationSelected})`. Directory's explicit journey selection uses `automatic-live-if-eligible`; browsing/inspection uses `preview-only`. Selection invokes the controller before its callback; host callback changes stack only. NavigationView contains one map and all overlay modes, including permission recovery, starting-point chooser, route preview, manual guide, FULL/PARTIAL/PEEK Directions, active Directions and arrival. Theme accepts documented navigation tokens, not custom stores/engines. Provider does not own/dispose a passed controller; owning host disposes it. NavigationView acquires an exclusive presentation lease; a second mount yields `busy`, not a second map/GPS engine. Local error boundary offers retry/manual fallback/exit; fatal native process failures cannot be caught by a JS boundary.

## Command semantics and lifecycle

Every asynchronous command returns Result, including cancellation; it never leaves an unhandled rejected promise for expected failures. Invalid input validates before state change. Superseding request aborts prior work and increments journey/request generation; callbacks must match controller/venue/pack/journey/request and current lifecycle epoch before commit. Listener exceptions are isolated and reported to optional host diagnostics without poisoning navigation. Snapshot and event order use monotonically increasing revision; unsubscribe/dispose are idempotent.

An explicit destination intent is one-shot and bound to journey/selection serial. When the presentation becomes active after Directory handoff, SDK resolves a usable GPS origin, calculates a valid walking preview and internally commits automatic Live Navigation only after rechecking fix, permission, route classification and current generation. It consumes the intent once; unavailable GPS presents origin resolution instead. Blur/exit/supersession cancels the intent and return does not replay auto-start. Host never reconstructs these guards. `preview-only` never auto-starts. Manual gate selection validates gate identity/eligibility in current venue, cancels outstanding calculations and invalidates previous preview/live authority; it remains authoritative for the next calculation until explicitly reset to automatic or a new journey/venue replaces it. No shortest-cost selector overrides it.

Destination change cancels pending/live/manual authority and creates a new journey with no inherited start. `current-location` is freshly evaluated (current policy 30s/50m plus authorization/services), not a host asserted fix. Block 2 hypothetical preview cannot start guidance until explicit manual confirmation. Manual upgrade prepares a replacement preview; confirmation revalidates fix and generation, and failed preparation/commit retains the old guide. Direct guide is labelled and cannot authorize ordinary walking Live Navigation. Arrival only comes from qualified live progress, never manual steps or fabricated GPS.

Map tab blur/unmount releases presentation lease and sets inactive: freeze progress, cancel reroutes, remove GPS watchers/timers/focus/speech work. Keep read-only destination/preview/manual context for same-controller return. Host foreground return or Settings return refreshes capability; only same-process preserved live session with valid authority can resume after fresh eligibility check. Background freezes authority; no background-location promise in v0. Process death persists only allowed settings/destination marker, never live/arrival/manual authority; relaunch offers a new preview. `exit` clears journey resources and emits exit, but preserves loaded venue. `dispose` also releases venue pin/subscriptions; later commands return disposed and listeners receive no later events.

Venue switching while a journey exists returns busy: host explicitly cancels first. Staging a new venue is transactional; failure keeps previous loaded venue. Locale changes preserve IDs/geometry/authority; `ur` RTL is view-local and must not force host-global I18nManager state or mirror map coordinates. Roman Urdu remains LTR. Analytics is opt-in host-owned; no default location export, recording or authentication requirement.
