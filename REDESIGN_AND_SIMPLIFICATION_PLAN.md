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
| Home/Map base layers | PENDING | Touch-target/selectability/accessible-name work already landed (prior sprint + #157); a full A–O pass on the base map experience itself (not its overlays) hasn't happened. `MapControls`/`LayersSheet`/`LocationTutorialTooltip` (the floating controls and their sheets) got their own **KEEP** pass this session — see row below. |
| Navigation (active) | **KEEP** (full A–E pass complete, both versions) | Full audit this session (`DEEP_UI_UX_AUDIT.md` NAV-001–004, B-001): status-slot priority, exit-confirmation, touch targets, instruction wording, and map presentation all sound structurally. One real defect found and fixed (B-001, next-step truncation). One real V1/V2 inconsistency found and NOT fixed by design — V1's inline map rendering vs V2's shared-layer rendering (documented, deferred as its own reviewed change, not a drive-by edit). One Codex dependency flagged (NAV-004). No case for REDESIGN or RESTRUCTURE found — the existing structure (two-slot top stack, single bottom trip bar, modal arrival) handles every state correctly; the problems found were wording/reuse defects, not structural ones. |
| Arrival | **KEEP** (full pass complete, both versions) | Full arrival-specific checklist run this session (`DEEP_UI_UX_AUDIT.md`): normal arrival, repeated arrival, rapid cancellation, destination change/new journey, blank-destination (NAV-003, closed) all traced and sound by construction. Background-return gap (NAV-004) is a Codex dependency, not a presentation defect — the arrival UI itself (heading, destination name, Done/Recenter, TalkBack announcement) needs no redesign. |
| Settings/Help/About | REFINE (in progress) | #155 fixed row semantics/copy. Structural layout not yet assessed. |
| MapControls, LayersSheet, LocationTutorialTooltip | **KEEP** (this session, fast-track UI/UX mission) | All three audited in full. Structure sound (real 48/56dp targets, existing active-state styling, existing fade/dismiss timing) — the problems found were accessibility-wiring gaps (redundant TalkBack stop, silent-to-screen-readers tooltip, missing selected-state), not structural ones, and all three are now fixed. One small justified motion addition (recenter success spring). No case for REDESIGN — see `DEEP_UI_UX_AUDIT.md` Batch A. |
| AppGuide | PENDING | Not yet audited. |

## Structural question — RESOLVED this session

`NavigationChromeV1`/`V2` and `NavigationMapLayersV1`/`V2` both render whenever
`mode === 'NAVIGATION' || mode === 'ARRIVAL'`, but only one ever produces content: V1 is
a genuinely live path (legacy Block destinations), not dead code, and mutual exclusion is
enforced structurally via `sourceVersion` (see `DEEP_UI_UX_AUDIT.md` FINDING
V1V2-REACHABILITY for the full trace). Consequence for redesign: **any redesign of V2's
chrome must also redesign or explicitly re-confirm V1's**, since V1 remains a live,
independently-reachable presentation of active navigation for legacy destinations, not a
fallback that will go away on its own. A REDESIGN proposal for one without the other would
leave a real, still-used surface stale.

## No REDESIGN has been proposed in this document

Every screen touched so far needed a targeted fix, not a structural redesign — consistent
with "do not redesign merely for visual novelty" and with this project's own minimal-diff
discipline. If a future A–O pass on navigation/arrival surfaces a genuine structural
problem (not just a copy or contrast defect), a full before/after spec will be added here
for that screen specifically, scoped to the actual finding.
