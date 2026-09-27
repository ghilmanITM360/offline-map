# Deep UI/UX Audit — Karachi Ijtema Offline Navigation

Findings register. See `SCREEN_AND_COMPONENT_INVENTORY.md` for what has and hasn't had
a full A–O pass. See `REDESIGN_AND_SIMPLIFICATION_PLAN.md` for KEEP/REFINE/REDESIGN
calls. See `CLAUDE_CODEX_HANDOFF.md` for anything needing owner or Codex input.

No completion percentage is claimed anywhere in this document, per mission instruction —
coverage is stated screen-by-screen in the inventory doc instead.

---

## FINDING #146 — Directory browse/search disagreed on unavailable-gate visibility

- **Screen/component**: `LocationsDirectoryScreen` (browse), `SearchService` (search),
  `PublicDestinationsService`, `V2PlaceAdapter`.
- **Problem**: Gate 18 and Gate 19 have real, verified coordinates but are blocked on
  physical ground-truth connector verification (`connectorStatus: 'ground_truth_required'`
  in `src/data/ijtema/gates.ts`). `SearchService.searchV2` passed
  `includeUnavailableGates: true` into `V2PlaceAdapter`, so these gates could surface in
  search. `PublicDestinationsService.getAll`/`getByCategory` (directory browse) passed no
  options, so the same gates were filtered out of browse entirely. A user could find
  Gate 18 by typing its name but never by scrolling the Gates category — or the reverse:
  see it in Recent (pushed there by a prior visit) with no way to find it again by
  browsing.
- **Supporting evidence**: `src/services/V2PlaceAdapter.ts` lines ~203–241 (the
  `includeUnavailableGates` filter, applied identically in both `getAllPlaces` and
  `getPlacesByCategory`); `src/services/SearchService.ts` `searchV2()` passing
  `includeUnavailableGates: true`; `src/services/PublicDestinationsService.ts` (pre-fix)
  passing no options.
- **User impact**: an attendee near Gate 18 searching for it by name would find it (with
  a route dead-end); the same attendee browsing the Gates list would never see it exists
  at all — an inconsistent, confusing model of "does this gate exist in the app."
- **Proposed improvement / owner decision**: approved direction (2026-09-27, this
  session): show verified-but-blocked gates consistently in both surfaces, muted,
  disabled, with a plain-language reason; never enable routing to them; rely on the
  directory's existing category-list adjacency (the gate sits in the same "Gates" list
  as available gates) to satisfy "obvious way to find available alternatives," rather
  than inventing a new "nearby gate suggestion" feature nothing else in the app has.
- **Implementation state**: **FIXED**. `PublicDestinationsService.getAll`/`getByCategory`
  now pass `{ includeUnavailableGates: true }`, matching search. Reused the existing #96
  `DestinationRow`/`LocationSheet` disabled+reason+accessible-label treatment — no new
  component. Commit `9b576a5`.
- **Test evidence**: `src/__tests__/PublicDestinationsService.test.ts` — rewrote the test
  that had codified the old hidden-in-browse behavior into one asserting parity between
  browse and search (same id set, same `isRoutable`/`unavailableReason` per gate).
  `src/__tests__/LocationsDirectoryScreen.test.tsx` RECENT-07 updated: the gate now
  legitimately renders twice (Recent section + its own Gates section), both instances
  disabled — was a single-instance assumption baked into the old test, not a weakened
  assertion. Full suite: `npm run test:components -- --runInBand` → 73/73 suites,
  641/641 tests passing. `npm run typecheck` and `npm run lint` clean.
- **Runtime verification state**: **RUNTIME UNVERIFIED** — no Android emulator/device in
  this session's environment; verified at the source/unit-test level only.

---

## Previously-reported GitHub issues confirmed already fixed on this branch

Verified by `git log --oneline -- <file>` plus `git merge-base --is-ancestor <fix
commit> HEAD` for each, in an earlier session on this same branch. Listed here for the
audit register rather than closed on GitHub without the owner's say — **owner
permission not yet given to close these issues**.

| Issue | Status | Fixing commit |
|---|---|---|
| #150, #151 | FIXED | `617a327` (WCAG-AA outside-venue banner contrast + gate/facility marker names) |
| #153 | FIXED | `2dd8a8a` (returning-user copy, permission contrast/error handling) |
| #154 | FIXED | `7494b88` (Locations Directory headings + Urdu search) |
| #155 | FIXED | `8a0d102` (Settings/Help/About row semantics/copy) |
| #156 | FIXED | `f038153` (live-region status banners + map-warning copy) |
| #157 | FIXED | `7d764e4` (accessible names for map layers/nav markers) |
| #158 | FIXED | `9d9b700` (splash subtitle contrast + real splash logo) |
| #159, #163 | FIXED | `2dd8a8a` (unified download fallback) |

## Screens/components with NO deep A–O pass yet

Per the inventory doc: AppGuideScreen, LayersSheet, LocationTutorialTooltip, MapControls,
the full NavigationChrome/MapLayers V1+V2 pair (active navigation + arrival — highest
priority), the diagnostics banner, the empty-state sheet, and a full component-level pass
on every map layer beyond the accessible-name fixes already made. These are **NOT
AUDITED**, not silently assumed fine.

## Remaining REQUIRES PRODUCT DECISION items carried from prior sessions

Not re-litigated here since no new evidence changes them: PERM-001/002/003/007/008,
#153 Finding 1, #154 Findings 2/3, #155 bilingual coverage, #156 Finding 4,
WEL-001–006, #127, SPLASH-UX-003/004, F005. See `CLAUDE_CODEX_HANDOFF.md`.
