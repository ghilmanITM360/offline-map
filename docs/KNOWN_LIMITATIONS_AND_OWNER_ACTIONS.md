# Known Limitations and Owner Actions

Honest edges of today's product, deliberate decisions that are not defects, and what only the owner can do. Current open issues: [`PROJECT_STATUS.md`](PROJECT_STATUS.md). None of the field/device items below may be marked done on source-level or emulator-level evidence alone (`AGENTS.md`).

## Product-risk limitations (not fixed, not currently planned)

- **No walkability or crowd-flow modeling** (#136). Temporary closures, one-way pedestrian flow or blocked areas on the day of the event are not modeled in the routing graph. For a live mass gathering this is a real product risk, not just a data gap: routes can suggest paths that are physically blocked or against enforced flow. No fix is in progress.
- **iOS is not built or runtime-verified.** Development and every verification so far is Android.
- **No representative-attendee usability testing.** The UI/UX audit is expert/source-level only; no elderly, low-literacy or otherwise representative attendee has been observed using the app, so "audited" never means "validated with users".
- **The Route Guide does not know where the user is.** Steps are advanced by hand; there is no progress, reroute or arrival. That is the point of the mode, and the card says so.
- **No App Link for Share.** There is no verified owned domain, so a shared place is a plain OpenStreetMap link and does not open this app (future path in `PRODUCT_AND_USER_FLOWS.md`).
- **Voice language is not tied to the app language.** Spoken instructions take their language from the legacy `settings.language` (default English, no UI), not from the language picker.
- **Block-tile Details is a long press** (and a TalkBack action); list rows have a visible info control. Tiles are too small for a second target, so the long press is not discoverable by itself.
- **First Map entry without location** shows a notice that the app can't find the user and is showing the main area (the Block 2 anchor), including for anyone who simply has not allowed location yet.
- **Approximate-only location** is detected from the OS at launch (Splash) and on every resolve; Settings still shows the location state as On for it, and the failure text after the live-guidance button points to app settings without saying "precise".
- **Directory reopened from the Map** (via `<- Places`) is pushed over it and hardware Back returns to the Map; after Done it is the root and Back leaves the app.
- **V1 and V2 navigation presentation are intentionally dual and must stay consistent.** `NavigationChromeV1`/`V2` are both live (mutually exclusive by the route's `sourceVersion`); any navigation/arrival UI change must land in both or justify why not. With the default flags every journey is V2-shaped.

## Deliberately kept, not defects

- The v1 routing/data system (`src/constants/data.ts`, `RoutingService`, `NavigationViewModel`) is kept as a rollback path behind the V2 feature flags and still supplies the facility landmarks; it is not deleted, to avoid an API break (#117 is the open decision). Do not "clean it up" without an explicit decision to drop rollback capability. v1 as a whole is **not deprecated**: it is a live, intentional rollback path per `AGENTS.md`/`CLAUDE.md`, not a blanket deprecation notice.
- Within that live v1 code exactly one function is actually dead: `SnapToRoadService.snapToRoad()` has no call sites and stays marked `@deprecated`. The rest of `SnapToRoadService` (`snapVisualToRoad`, `resolveRoutingNode`) is live, called from v1's `NavigationViewModel`. Do not delete or un-deprecate either without updating this doc (`scripts/test-legacy-and-permissions.ts` enforces it).
- `isNavigating` vs `MapMode` are intentionally separate state (see `ARCHITECTURE.md`); do not merge them without re-reading why that was rejected.
- `pointInPolygon` is implemented three times (`RoutingService`, `SnapToRoadService`, `graphBuilder`); stable and low-risk, consolidate only when touching them.

## Resolved (do not reopen without new evidence)

- Gate label clipping on Android markers: resolved by drawing labels in the `MapLabelOverlay` layer instead of native marker children.
- Routing-core Dijkstra duplication: consolidated into shared `src/utils/AStar.ts`.
- Duplicate gate-selection cost path (`EntryGateRoutingService.findBestGateForOutsideUser`): removed; the single path lives in `RoutingServiceV2`.
- NAV-004 (V1 had no background-resume GPS freshness handler): fixed in PR #172; device verification is PHYSICAL DEVICE REQUIRED (`TESTING.md` section 10).
- The Google Maps SDK / `react-native-maps` map and any Maps-key requirement (#140).

## Gate reconciliation (venue data)

The data has 18 gates (ids 1-5, 7, 8, 12-22; gates 6, 9, 10 and 11 do not exist). **16** are verified entries that can start a route from outside. **Gate 18** has a coordinate but no valid graph connector within 320 m of any internal path (`connectorStatus: ground_truth_required`, `canStartRouteFromOutside` false, disabled in route selection) and **Gate 19** is `needs_verification` with field connectivity deferred; both need a physical survey (#43, #44, FIELD REQUIRED) and must not be assumed routable from map data. A gate without a verified connector is never offered as an automatic or manual entry. Facts: `src/data/ijtema/gates.ts`; background in `OFFLINE_MAP_AND_DATA.md`.

## Owner actions (cannot be completed by an agent)

| # | Action | Why it needs the owner |
|---|---|---|
| #47 | Privacy Policy / Terms / Support links | Legal content must be owner-provided, never agent-drafted (the About links are unset placeholders) |
| #48 | Production signing / Play App Signing | Needs the owner's Play Console access and real keystore custody |
| #49 | Historical exposed Google Maps key | The app no longer uses any Maps key; the owner may delete the old key in Google Cloud Console (optional hygiene) |
| #123 | Deploy the walking-routes proxy | Billing/IAM/ingress and a third-party coordinate-transfer disclosure are owner decisions |
| #117 | Retire or reconcile the legacy v1 dataset | Dropping rollback capability is an owner call |
| #133 | Admin-data questionnaire | Superseded by the repo-controlled flow unless the owner asks for more |

## UI/UX owner decisions still open

Product/scope calls no agent may make. Identifiers are from the retired UI/UX audit (full text in git history at `fb13901`; the deep-audit documents were removed from the tree once the screens they described changed):

- Welcome screen: WEL-001 to WEL-006.
- Directory / Settings / status copy: #154 findings 2 and 3; #155 bilingual (Urdu) coverage; #156 finding 4.
- #127; SPLASH-UX-003 and SPLASH-UX-004; F005.
- Splash asset authority: `app.json` uses `assets/splash.png`, while native `android/app/src/main/res/drawable-*/splashscreen_logo.png` are separate committed files. Which is authoritative is undecided.

## Field and physical-device blockers

| # | Action | Level |
|---|---|---|
| #43, #44 | Gate 18/19 connector survey | FIELD REQUIRED |
| #116 | Mimbar survey (no record exists; never fabricate) | FIELD REQUIRED |
| #46 | Physical Ijtema walking acceptance test; LOC-06/08/09/10/11 location-capability verification | FIELD REQUIRED / PHYSICAL DEVICE REQUIRED |
| #135 | Final Android APK acceptance on a connected phone (TalkBack, GPS, thermal, install) | PHYSICAL DEVICE REQUIRED |

The device accessibility checklist and the acceptance checklist are in [`TESTING.md`](TESTING.md).
