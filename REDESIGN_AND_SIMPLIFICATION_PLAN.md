# Redesign and Simplification Plan

Treatment per screen: **KEEP** / **REFINE** / **SIMPLIFY** / **RESTRUCTURE** /
**REDESIGN**. Only screens with an actual audit pass (see other docs) get a call here —
everything else is listed as pending so this file doesn't invent judgments about
un-audited screens.

| Screen | Treatment | Why |
|---|---|---|
| Splash | REFINE (in progress) | #158 already fixed the two concrete defects found (subtitle contrast, invisible logo). No further redesign justified without a new finding — visual novelty is not a reason to touch it again. |
| Welcome | REFINE (in progress) | #153 fixed returning-user copy confusion. Structure/layout itself not yet assessed against A–O; no redesign claim beyond the fixed copy issue. |
| Permission | REFINE (in progress) | #153 fixed contrast + error handling. Same caveat as Welcome. |
| DownloadMap | REFINE (in progress) | #159/#163 unified fallback copy. Same caveat. |
| LocationsDirectory | REFINE (in progress) | #154 (headings/Urdu search) + #146 (gate visibility parity, this session) both fixed real defects with minimal, targeted changes — no structural redesign needed to solve either. |
| Home/Map base layers | PENDING | Touch-target/selectability/accessible-name work already landed (prior sprint + #157); a full A–O pass on the base map experience itself (not its overlays) hasn't happened. |
| Navigation (active) | PENDING — likely highest-value next target | Not yet audited at all. This is where an attendee is walking, in a crowd, needing the clearest possible instruction — and where V1/V2 duplication (see below) needs resolving before any redesign work, not after. |
| Arrival | PENDING | Not yet audited. |
| Settings/Help/About | REFINE (in progress) | #155 fixed row semantics/copy. Structural layout not yet assessed. |
| AppGuide, LayersSheet, LocationTutorialTooltip, MapControls | PENDING | Not yet audited. |

## A structural question that should be answered before any REDESIGN call

`NavigationChromeV1`/`V2` and `NavigationMapLayersV1`/`V2` both exist and both render
whenever `mode === 'NAVIGATION' || mode === 'ARRIVAL'`. Before proposing any redesign of
the active-navigation experience, the next session needs to establish (by reading
`useNavigationOverlayV1`/`V2` and whatever decides which one actually renders content
for a given trip) whether V1 is:
- dead code kept for a reason not yet documented, or
- a genuinely live fallback path (e.g. for legacy/graph-only data) that still needs its
  own audit.

Redesigning V2's chrome while V1 is silently still reachable in some code path would be
incomplete work presented as complete. This is flagged here rather than guessed at.

## No REDESIGN has been proposed in this document

Every screen touched so far needed a targeted fix, not a structural redesign — consistent
with "do not redesign merely for visual novelty" and with this project's own minimal-diff
discipline. If a future A–O pass on navigation/arrival surfaces a genuine structural
problem (not just a copy or contrast defect), a full before/after spec will be added here
for that screen specifically, scoped to the actual finding.
