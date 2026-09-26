# UI/UX Screen Coverage Matrix

Built from the current application (branch `integration/ijtema-clean-baseline`, HEAD
`1599c32`) plus the recovered September 5 audit. "Historical screenshot" refers only to
the 6 captures in `.superpowers/premium-map-audit/screenshots/`; "current screenshot"
means a capture taken during this reconciliation pass — none were taken this session, so
that column is NOT TESTED throughout.

| Screen/state | Source coverage | Historical screenshot | Current screenshot | Functional | Accessibility | Automated tests | Emulator | Physical device | Field | Blocking issue | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Splash | SOURCE VERIFIED (not read this pass) | none | NOT TESTED | NOT TESTED | NOT TESTED | unknown | NOT TESTED | NOT TESTED | NOT TESTED | none | UNTESTED |
| Welcome / onboarding | NOT TESTED | none | NOT TESTED | NOT TESTED | NOT TESTED | unknown | NOT TESTED | NOT TESTED | NOT TESTED | none | UNTESTED |
| Location permissions | NOT TESTED | none | NOT TESTED | NOT TESTED | NOT TESTED | unknown | NOT TESTED | NOT TESTED | NOT TESTED | none | UNTESTED |
| Download Map (offline setup) | SOURCE VERIFIED (via #128 NAV-UX-004 finding) | none | NOT TESTED | NOT TESTED | SOURCE VERIFIED — 0 of 9 controls have accessibilityLabel/Role (NAV-UX-004) | unknown | NOT TESTED | NOT TESTED | NOT TESTED | tracked in #128 (NAV-UX-004) | PARTIALLY AUDITED |
| Locations Directory | NOT TESTED | none (planned, not reached) | NOT TESTED | NOT TESTED | NOT TESTED | unknown | NOT TESTED | NOT TESTED | NOT TESTED | none | UNTESTED |
| Explore Map (idle) | SOURCE VERIFIED | `02-explore-map-BLOCKED-basemap.png` — basemap BLOCKED | NOT TESTED | EMULATOR VERIFIED (chrome/markers only, not basemap) | code-only (see P1-1/P1-3) | some (LayersSheet, SearchBarField tests) | EMULATOR VERIFIED (partial — basemap blocked) | NOT TESTED | NOT TESTED | basemap rendering itself is an unresolved capture-environment gap, no tracking issue found | PARTIALLY AUDITED |
| Search entry | SOURCE VERIFIED | `03a-search-entry.png` | NOT TESTED | EMULATOR VERIFIED | code-only | `SearchBarField.test.tsx` | EMULATOR VERIFIED | NOT TESTED | NOT TESTED | none | AUDITED (basemap caveat aside) |
| Search with query | SOURCE VERIFIED | `03b-search-with-query.png` | NOT TESTED | EMULATOR VERIFIED | code-only | `SearchBarField.test.tsx` | EMULATOR VERIFIED | NOT TESTED | NOT TESTED | none | AUDITED |
| Block selected | NOT TESTED | none (not reached) | NOT TESTED | NOT TESTED | NOT TESTED | unknown | NOT TESTED | NOT TESTED | NOT TESTED | none — needed to resolve open marker-color-coding question | UNTESTED |
| Gate selected | SOURCE VERIFIED | `05-gate-selected.png` | NOT TESTED | EMULATOR VERIFIED | code-only | `LocationSheet.test.tsx` | EMULATOR VERIFIED | NOT TESTED | NOT TESTED | none | AUDITED (basemap caveat) |
| Rasta selected | NOT TESTED | none (not reached) | NOT TESTED | NOT TESTED | NOT TESTED | unknown | NOT TESTED | NOT TESTED | NOT TESTED | none | UNTESTED |
| Shahr-e-Pindal selected | NOT TESTED | none (not reached, existence in seed data unclear) | NOT TESTED | NOT TESTED | NOT TESTED | unknown | NOT TESTED | NOT TESTED | NOT TESTED | none | UNTESTED |
| LocationSheet preview | SOURCE VERIFIED | `08-locationsheet-preview.png` | NOT TESTED | EMULATOR VERIFIED | AUTOMATED TEST VERIFIED (Save/Share/Details roles, #65) | `LocationSheet.test.tsx` | EMULATOR VERIFIED | NOT TESTED | NOT TESTED | North-up/zoom overlap + blue false-affordance badge text, unresolved, no tracking issue | AUDITED, 2 open visual defects |
| LocationSheet **true Details** view | SOURCE VERIFIED | **none — `09-*.png` is mislabeled, actually a 2nd preview capture** | NOT TESTED | NOT TESTED | NOT TESTED | unknown | NOT TESTED | NOT TESTED | NOT TESTED | none — needs a real capture via correct tap target | UNTESTED (previously miscounted as tested) |
| Route calculating | NOT TESTED | none | NOT TESTED | NOT TESTED | NOT TESTED | unknown | NOT TESTED | NOT TESTED | NOT TESTED | none | UNTESTED |
| Route Preview / Ready | SOURCE VERIFIED (`RoutePreviewSection`) | none | NOT TESTED | NOT TESTED | code-only (P2-5, up to 4 stacked cards) | some (route/nav scripts) | NOT TESTED | NOT TESTED | NOT TESTED | none — highest-priority missing capture per both audits | RUNTIME BLOCKED — NOT VERIFIED |
| Start Navigation (reachability/enablement) | SOURCE VERIFIED (`DirectionsViewModel`) | none | NOT TESTED | AUTOMATED TEST VERIFIED for the #109 stale-GPS defect class (closed, fixed) | NOT TESTED | `DirectionsViewModel` tests | NOT TESTED | NOT TESTED | NOT TESTED | historical "~1 in 21" claim unverifiable — see `DIRECTIONS_HISTORY.md` note in progress doc | PARTIALLY AUDITED, historical claim unresolved |
| Active Navigation | SOURCE VERIFIED (`NavigationChromeV2`, safety-tier fonts confirmed in code) | none | NOT TESTED | NOT TESTED | code-only (P1-6 fixed; GPS_LOST/weak-GPS precedence confirmed in source) | `NavigationChromeV2.test.tsx` | NOT TESTED | NOT TESTED | NOT TESTED | none — highest-risk unknown, never visually captured | RUNTIME BLOCKED — NOT VERIFIED |
| Rerouting | SOURCE VERIFIED | none | NOT TESTED | NOT TESTED | NOT TESTED | some (reroute scripts) | NOT TESTED | NOT TESTED | NOT TESTED | none | RUNTIME BLOCKED — NOT VERIFIED |
| GPS loss/recovery | SOURCE VERIFIED | none | NOT TESTED | NOT TESTED | code-only (P1-6 fixed) | `NavigationChromeV2.test.tsx` | NOT TESTED | NOT TESTED | NOT TESTED | none | RUNTIME BLOCKED — NOT VERIFIED |
| Offline / graph fallback | SOURCE VERIFIED | none | NOT TESTED | NOT TESTED | code-only (P2-6) | some | NOT TESTED | NOT TESTED | NOT TESTED | none | RUNTIME BLOCKED — NOT VERIFIED |
| Arrival | SOURCE VERIFIED (#111/#112 fix present) | none | NOT TESTED | AUTOMATED TEST VERIFIED for arrival-latch defect class (closed) | NOT TESTED | some | NOT TESTED | NOT TESTED | NOT TESTED | none | RUNTIME BLOCKED — NOT VERIFIED |
| Settings | NOT TESTED | none | NOT TESTED | NOT TESTED | NOT TESTED | unknown | NOT TESTED | NOT TESTED | NOT TESTED | none | UNTESTED |
| Help | NOT TESTED | none | NOT TESTED | NOT TESTED | NOT TESTED | unknown | NOT TESTED | NOT TESTED | NOT TESTED | none | UNTESTED |
| About | NOT TESTED | none | NOT TESTED | NOT TESTED | NOT TESTED | unknown | NOT TESTED | NOT TESTED | NOT TESTED | none | UNTESTED |
| App Guide | NOT TESTED | none | NOT TESTED | NOT TESTED | NOT TESTED | unknown | NOT TESTED | NOT TESTED | NOT TESTED | none | UNTESTED |
| Drawer / secondary nav | NOT TESTED | none (existence unconfirmed) | NOT TESTED | NOT TESTED | NOT TESTED | unknown | NOT TESTED | NOT TESTED | NOT TESTED | none | UNTESTED |

"AUDITED" above means audited for the dimensions the original two reports actually
covered (visual + accessibility, from a single emulator capture with a broken basemap) —
it does not mean physical-device or field-validated, and does not mean every dimension
in the Phase 3/9 checklist (touch targets, typography scaling at runtime, safe areas,
loading/error feedback, offline behavior, small-screen behavior, back/navigation,
mistake recovery) was individually exercised. Treat "AUDITED" rows as a strong starting
point, not a closed audit.
