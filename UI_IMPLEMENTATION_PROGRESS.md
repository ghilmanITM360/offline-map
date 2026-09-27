# UI Implementation Progress

Branch: `fix/claude-ui-accessibility-sprint`. All commits below preserved, none rewritten.

| Commit | Summary |
|---|---|
| `617a327` | fix(a11y): WCAG-AA outside-venue banner contrast + gate/facility marker names |
| `7d764e4` | fix(a11y): accessible names for remaining map layers and nav markers (#157) |
| `7494b88` | fix(a11y): Locations Directory section headings + Urdu search coverage (#154) |
| `8a0d102` | fix(a11y): Settings/Help/About row semantics and copy fixes (#155) |
| `f038153` | fix(a11y): live-region status banners + end-user map-warning copy (#156) |
| `2dd8a8a` | fix(ux): returning-user copy, permission contrast/error handling, unified download fallback (#153, #163, #159) |
| `9d9b700` | fix(a11y): splash subtitle contrast + real native splash logo (#158) |
| `9b576a5` | fix(#146): directory browse shows unavailable gates same as search |

## Latest validation run (after `9b576a5`)

```
npm run typecheck   → clean (typecheck:app + typecheck:scripts)
npm run lint        → clean (eslint .)
npm test            → all suites passing (jest unit suites + all scripts/test-*.ts structural checks)
npm run test:components -- --runInBand → 73 suites / 641 tests passing
git diff --check    → clean (no whitespace errors)
```

Routing-specific suites (`test:all-gates-v2`, `test:outside-street-gate-selection-cost-v2`,
`test:core-provider-routing-contract-v2`, `test:reroute-v2`) were **not** re-run for this
commit — #146 is a directory/search visibility change, not a routing-provider or
ViewModel change, so AGENTS.md's "routing changes also require" clause doesn't apply.
Nothing in `RoutingServiceV2`, provider ordering, or gate eligibility was touched.

## Final Git status after this session's work

- Branch: `fix/claude-ui-accessibility-sprint`
- HEAD: `9b576a5`
- Working tree: clean except untracked `node_modules` (expected, gitignored)
- Nothing pushed, merged, or rebased — no such action taken or requested.

## This session — navigation audit, no source changes

Traced the V1/V2 navigation control flow end to end (`HomeScreen.tsx`,
`useNavigationOverlayV1/V2.ts`, `NavigationViewModel(V2).ts`, `V2NavigationAdapter.ts`,
`DirectionsViewModel.ts`, `useMapMode.ts`) and did a partial A/D/E audit pass on
`NavigationChromeV2.tsx`. Findings recorded in `DEEP_UI_UX_AUDIT.md` (FINDING
V1V2-REACHABILITY, NAV-001–003). No defect was confirmed that warranted a code change
this pass — findings were KEEP (status-slot priority, exit-confirmation, touch targets)
or flagged-not-fixed (NAV-002 live-region assertiveness needs a device to confirm,
NAV-003 needs one more trace before it's known to be reachable). Docs-only commit; no
source or test file touched, so the required-validation suite was not re-run for it
(same precedent as the prior docs-only commit `9fb7fe8`) — `typecheck`/`lint`/`test`
results below are unchanged since `9b576a5`.

## This session — full V1/V2 active-nav + arrival audit, one fix landed

Completed B (instruction wording) and C (map presentation) for both `NavigationChromeV1`/
`V2` and `NavigationMapLayersV1`/`V2`; ran the complete arrival-experience checklist for
both versions (repeated arrival, rapid cancellation, background-return, destination
change, blank-destination). Closed NAV-003 (structurally unreachable, evidence in
`DEEP_UI_UX_AUDIT.md`). Found and fixed **B-001**: the "Then: ..." next-step preview
rendered the full raw instruction sentence inside a `numberOfLines={1}` text, so the
ellipsis routinely cut off the destination name at the end of the sentence — the one
useful part. Replaced with the short maneuver-label + road-name form already used by the
current-step card, in both `NavigationChromeV1.tsx` and `NavigationChromeV2.tsx`. Found
NAV-004 (V1 missing V2's background-resume GPS-staleness fix) — Codex dependency, not
fixed here, flagged in `CLAUDE_CODEX_HANDOFF.md`. Found a V1/V2 map-rendering
inconsistency (V1 hand-rolls venue/block/edge rendering instead of reusing the shared
`RastaLayer`/`SpecialRouteLayer`/`BlockLayer` components V2 uses) — documented, not fixed
this session (real change, but a larger visual-regression-risk item deserving its own
reviewed pass, not a drive-by edit).

Commit: `87c718f` (fix(nav): next-step preview no longer truncates the destination name).

### Validation for this commit

```
npm run typecheck   → clean (typecheck:app + typecheck:scripts)
npm run lint        → clean (eslint .)
npm test            → all suites passing (all scripts/test-*.ts structural checks, 0 failed each)
npm run test:components -- --runInBand → 73/73 suites, 643/643 tests passing (+2 new
                                          B-001 regression tests vs the prior 641)
git diff --check    → clean (no whitespace errors)
```

Routing-specific suites (`test:all-gates-v2`, `test:outside-street-gate-selection-cost-v2`,
`test:core-provider-routing-contract-v2`, `test:reroute-v2`) were already covered by the
full `npm test` run above (they're part of the same script chain) — all passed. No
routing/GPS/ViewModel navigation logic was touched; only the two Chrome components'
next-step text rendering changed.

## What's next

Home/Map audit (`MapControls`, `MapControlsRecenter`, `LayersSheet`,
`LocationTutorialTooltip`, all map layer components, diagnostics/empty-state
presentation) — not yet touched. Then route preview / destination-selection audit
(`LocationSheet`, gate selection, `OutsideRouteStatusCard` wording accuracy). Then the
remaining application-wide A–O pass (Splash, Welcome, Permission, Download Map,
Locations Directory, Settings, Help, About, AppGuide) — several already PARTIALLY
AUDITED from prior sessions. Device-testing checklist accumulated this session (touch-
target overlap at small screens/large fonts, TalkBack focus-on-arrival, rapid-arrival-
then-new-preview timing) should be run whenever an emulator/device becomes available —
see `DEEP_UI_UX_AUDIT.md` for the exact procedures. See `CLAUDE_CODEX_HANDOFF.md` for
NAV-004, the one open Codex question from this session.
