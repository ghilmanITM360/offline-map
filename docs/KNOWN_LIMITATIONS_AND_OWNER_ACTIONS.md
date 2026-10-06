# Known Limitations and Owner Actions

## Product-risk limitations (not fixed, not currently planned)

- **No walkability/crowd-flow modeling.** Temporary closures, one-way pedestrian flow, or blocked areas during the actual event are not modeled anywhere in the routing graph. For a live mass gathering, this is a real product risk, not just a data-completeness gap — routes can suggest paths that are physically blocked or against enforced flow on the day. No fix is in progress; flag if this becomes a field-reported issue.
- **iOS is not fully runtime-verified.** Development so far has centered on Android; iOS has an unset Maps key placeholder (see `docs/RELEASE_SECURITY_PRIVACY.md`) and no equivalent device-verification pass.
- **No representative-attendee usability testing.** The UI/UX audit is expert/source-level only. No elderly, low-literacy, or otherwise representative attendee has been observed using the app, so "audited" never means "validated with users". Treat every UI/UX call as unproven until that testing happens.
- **NAV-004 — V1 navigation lacks V2's background-resume GPS-staleness handler.** `NavigationViewModelV2` registers an `AppState` `change` listener that forces a fresh GPS fix and marks `GPS_LOST` on foreground resume (`scripts/test-navigation-background-resume.ts`). `NavigationViewModel` (V1, legacy Block destinations) has none; `AppState` is used only in `NavigationViewModelV2`, `GPSManagerService`, `useAppStore` and `SettingsScreen`. A V1 user who backgrounds the app mid-walk can see stale progress/ETA on return. Same lifecycle-parity class as #149. Open; routing/GPS is Codex-owned, so it needs an owner/Codex decision on porting the handler or accepting the gap given low V1 traffic.
- **V1/V2 navigation presentation is intentionally dual, and must stay consistent.** `NavigationChromeV1/V2` and `NavigationMapLayersV1/V2` are both live: V1 for legacy Block destinations, V2 for the Gates/facility model, mutually exclusive via the `sourceVersion` check in `NavigationViewModel`. Known unfixed difference: V1 renders its map inline, V2 uses shared layers. Any navigation/arrival UI change must land in both versions or explicitly justify why not.

## Deliberately kept, not defects

- v1 routing/data system (`src/constants/data.ts`, `RoutingService`) is kept as a rollback path behind feature flags, not deleted, to avoid an API break. Do not "clean it up" without an explicit decision to drop rollback capability. v1 as a whole is **not deprecated** — it's a live, intentional rollback path per `AGENTS.md`/`CLAUDE.md`, not a blanket deprecation notice.
- Within that live v1 code, exactly one function is actually dead: `SnapToRoadService.snapToRoad()` has no call sites and stays marked `@deprecated`. The rest of `SnapToRoadService` (`snapVisualToRoad`, `resolveRoutingNode`) is live, called from v1's `NavigationViewModel` — do not delete or un-deprecate either without updating this doc.
- `isNavigating` vs `MapMode` are intentionally separate state (see `docs/ARCHITECTURE.md`) — do not merge them without re-reading why that was rejected before.

## Resolved (do not reopen without new evidence)

- Gate label clipping on Android markers — resolved by moving label rendering to a separate `MapLabelOverlay` layer instead of native `Marker` children (see `docs/ARCHITECTURE.md`). Earlier audits describing this as open are retired.
- Routing-core Dijkstra duplication — consolidated into shared `src/utils/AStar.ts`.
- Stale/duplicate gate-selection cost path (`EntryGateRoutingService.findBestGateForOutsideUser`) — removed; single path now lives in `RoutingServiceV2`.

## Owner actions (cannot be completed by an agent)

| # | Action | Why it needs the owner |
|---|---|---|
| #47 | Privacy / Terms / Support links | Legal content must be owner-provided, never agent-drafted |
| #48 | Production signing / Play App Signing | Requires owner's Play Console access and real keystore custody |
| #49 | Historical exposed Google Maps key | App no longer uses any Maps key; owner may delete the old key in Google Cloud Console (optional hygiene) |

## UI/UX owner decisions still open

Product/scope calls that no agent may make. Identifiers are from the retired UI/UX audit (full text in git history at `fb13901`; the deep-audit documents were removed from the tree once the screens they described changed):

- Welcome screen: WEL-001 to WEL-006.
- Directory / Settings / status copy: #154 Findings 2 and 3; #155 bilingual (Urdu) coverage; #156 Finding 4.
- #127; SPLASH-UX-003 and SPLASH-UX-004; F005.
- Splash asset authority: `app.json` uses `assets/splash.png`, while native `android/app/src/main/res/drawable-*/splashscreen_logo.png` are separate committed files. Which is authoritative is undecided.

## Field blockers (need the physical venue)

| # | Action |
|---|---|
| #43, #44 | Gate 18/19 graph connector survey |
| #46 | Physical Ijtima walking acceptance test |

## Physical-device blockers (need real hardware)

| # | Action |
|---|---|
| #46 | LOC-06/08/09/10/11 (remainder of closed #45) physical-device location-capability verification — PHYSICAL DEVICE REQUIRED |

None of the above should be marked done based on source-level or emulator-level checks alone — see the evidence-level rule in `AGENTS.md`.

## Device accessibility checklist (PHYSICAL DEVICE REQUIRED for TalkBack; an emulator is supporting evidence only; all currently unverified at runtime)

Source and Jest checks prove the wiring, not TalkBack behavior. Run on Android with TalkBack, at a small screen (about 5 inch, 1080x1920) and at the largest font scale, for both V1 and V2 navigation:

- **NAV-002 GPS warning announcements:** `GPS_LOST` uses `accessibilityLiveRegion="assertive"` while other status banners use `"polite"`. Confirm a flapping GPS state does not cut off a maneuver announcement, and that repeated identical warnings re-announce sensibly.
- **Arrival focus:** the arrival card sets `accessibilityViewIsModal` and fires `announceForAccessibility`; confirm TalkBack focus actually moves to the card and does not rely on the announcement alone.
- **Rapid navigation transitions:** arrive, then immediately start a new preview before tapping Done. Expected to self-heal within a frame, but no automated test covers it.
- **Small-screen / large-font layout:** recenter button vs Exit hit areas must not overlap on a short screen; the instruction card must not clip or collide with the mute button at maximum font scale.
- **One-shot announcements:** route-ready/route-error, location tooltip and arrival announcements each fire once per event, not repeatedly.
- **One accessibility node per map object:** overlay labels take priority, marker labels are fallback only; no double reads.

## Known limitations of the journey flow (2026-10)

Honest edges of today's behavior, not defects scheduled for a fix:

- **Block-tile Details is a long press** (and a TalkBack action); list rows have a visible info control. Tiles are too small for a second target, so the long press is not visible by itself.
- **The Route Guide does not know where the user is.** Steps are advanced by hand; there is no progress, reroute or arrival. That is the point of the mode, and the card says so.
- **"Location unavailable. Showing Block 2."** appears on first Map entry for anyone who has not allowed location yet, because Block 2 is the camera anchor when there is no usable location. The wording predates location becoming optional.
- **Approximate-only** is detected from the OS at launch (Splash) and on every resolve; Settings still shows "Allowed" for it, and the failure text after the live-guidance button points to app settings without saying "precise".
- **`hasSeenMapOverview`** is still persisted but only informational; `MapStartupController.resolveColdLaunchCamera` is unused by production code (kept for its tests).
- **Directory reopened from the Map** (via `<- Places` or the drawer) is pushed over it; hardware Back returns to the Map. After Done it is the root and Back leaves the app.
