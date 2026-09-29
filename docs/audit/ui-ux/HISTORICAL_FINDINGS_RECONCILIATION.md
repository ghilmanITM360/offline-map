# Historical Findings Reconciliation

Re-verifies each finding from the September 5, 2026 `.superpowers/premium-map-audit/`
against current source at HEAD `1599c32` (branch `integration/ijtema-clean-baseline`,
2026-09-26). 21 days and multiple accessibility-focused commits separate the original
audit from this reconciliation. A finding is never marked STILL PRESENT merely because
the containing component still exists — the specific code cited was re-read at its
current location.

Evidence-level key: SOURCE VERIFIED (re-read the current file/line), AUTOMATED TEST
VERIFIED (a committed test asserts the behavior), EMULATOR VERIFIED (captured on-device/
emulator, original audit only), NOT TESTED (no runtime evidence either then or now).

## P1 findings

### P1-1 — Outside-Ijtema banner contrast (`#F29900`/white)

- Original: `src/views/screens/HomeScreen.tsx:2246`, `outsideVenueBanner.backgroundColor:
  '#F29900'`, ~2.25:1 contrast — same color the codebase's own `theme/colors.ts` comment
  documents as WCAG-AA-failing and already replaced elsewhere with `#946500`.
- Current location: `src/views/screens/HomeScreen.tsx:1979` (`backgroundColor: '#F29900'`),
  used at line 1627. Line number shifted (21 commits touched this file since Sep 5); the
  code itself is unchanged.
- **Classification: STILL PRESENT.** SOURCE VERIFIED.
- Existing GitHub issue: none found (searched `F29900`, `outsideVenueBanner`,
  `outside-venue` across all issues, open and closed — no match).
- Remaining investigation: none needed to confirm the defect; a contrast fix should reuse
  the already-vetted `staticColors.weakGpsBackground` (`#946500`), consistent with how the
  same color was fixed elsewhere in this codebase.

### P1-2 — LayersSheet controls missing accessibility roles/state

- Original: `src/views/components/map/LayersSheet.tsx:74-96` — Map Type segmented control
  and 4 overlay toggle rows had no `accessibilityRole`/`accessibilityLabel`/`accessibilityState`.
- Current: `LayersSheet.tsx` now has, on the Standard/Satellite segments (lines 87-89,
  97-99), `accessibilityRole="button"`, `accessibilityLabel`, `accessibilityState={{selected}}`;
  on each `OverlayRow` (lines 35-37), `accessibilityRole="switch"`, `accessibilityLabel`,
  `accessibilityState={{checked}}`.
- **Classification: ALREADY FIXED.** Commit `7960778` ("fix: map control accessibility
  semantics, search font-scale cap, reduced-motion pulse gate", 2026-09-21, closes #65)
  added these props and a new `src/__tests__/LayersSheet.test.tsx`. AUTOMATED TEST VERIFIED.
- Existing GitHub issue: #65 (closed, merged via this commit).
- Remaining investigation: none for the accessibility props. A real TalkBack pass (not
  component-test-only) is still recommended per the original audit's own "Items requiring
  TalkBack/font-scaling testing" section — that runtime gap is unrelated to whether the
  props exist in source, which they now do.

### P1-3 — GateLayer/FacilityLayer bare Marker dots, no accessible name

- Original: `src/views/components/map/GateLayer.tsx:54-63` — suppressed/unselected gates
  render a bare `react-native-maps` `Marker` (~10px dot) with no `accessibilityLabel`,
  `title`, or `description`. Original audit flagged `FacilityLayer.tsx` as "likely" the
  same gap by pattern, not fully read line-by-line.
- Current: re-read `GateLayer.tsx` in full at current HEAD — the `Marker` at (current)
  lines 54-63 is unchanged: still a bare dot, still no accessibility props. `grep -n
  accessibilityLabel src/views/components/map/FacilityLayer.tsx` returns zero matches,
  confirming the original audit's "likely" flag on `FacilityLayer.tsx` as accurate.
- **Classification: STILL PRESENT** (both files). SOURCE VERIFIED.
- Existing GitHub issue: none found (searched `GateLayer`, "suppressed gate marker" —
  no match, open or closed).
- Remaining investigation: none needed to confirm; fix is adding `accessibilityLabel`/
  `title` to the `Marker` in both files, per the original audit's recommended fix #3.

### P1-4 — LocationSheet Save/Share/Details row missing accessibility props

- Original: `src/views/components/map/LocationSheet.tsx:844-875` — all three
  `secondaryAction` Pressables (Save/Share/Details) had no `accessibilityRole` or
  `accessibilityLabel`.
- Current: re-read `LocationSheet.tsx:872-919` — Save (874-879) has `accessibilityRole=
  "button"`, `accessibilityLabel`, `accessibilityState={{selected: isFav}}`; Share
  (888-892) has `accessibilityRole="button"`, `accessibilityLabel="Share location"`;
  Details (909-914) has `accessibilityRole="button"`, `accessibilityLabel="Show details"`.
  All three now match the pattern used elsewhere in the file.
- **Classification: ALREADY FIXED.** Same commit `7960778` (closes #65), which added
  `src/__tests__/LocationSheet.test.tsx`. AUTOMATED TEST VERIFIED.
- Existing GitHub issue: #65 (closed).
- Remaining investigation: none for source; TalkBack runtime confirmation still
  recommended generally, not because this specific gap is unresolved in source.

### P1-5 — SearchBarField fixed height, font-scale clipping risk

- Original: `src/views/components/common/SearchBarField.tsx:33-47` — `SEARCH_BAR_HEIGHT
  = 52` fixed `height` with `fontSize: 16`, flagged as a plausible clipping risk at large
  OS font scales, explicitly unverified without a real font-scale test.
- Current: re-read `SearchBarField.tsx` — `SEARCH_BAR_HEIGHT = 52` and `fontSize: 16` are
  still present (lines 34, 43), **but** line 28 now sets `maxFontSizeMultiplier={1.8}` on
  the `TextInput`, added by the same commit `7960778` ("SearchBarField:
  maxFontSizeMultiplier={1.8} so the fixed-height input row stays readable instead of
  clipping at large OS font scales (e.g. 2.0x)").
- **Classification: PARTIALLY FIXED.** The structural risk (fixed height, no `minHeight`)
  is unchanged, but the specific clipping mechanism the audit flagged is now bounded by a
  cap intended to prevent exactly this. AUTOMATED TEST VERIFIED that the prop is set
  (`src/__tests__/SearchBarField.test.tsx`, added same commit); NOT TESTED at actual 180%/
  200% OS font scale on a real device/emulator — the cap's effectiveness at its own ceiling
  (1.8x) has not been visually confirmed, only that the prop exists.
- Existing GitHub issue: #65 (closed) covers the fix; no open issue tracks the remaining
  "confirm visually at 1.8x" gap.
- Remaining investigation: RUNTIME REVERIFICATION REQUIRED — set Android system font scale
  to 180% and screenshot the search bar to confirm no clipping at the cap's own ceiling.

### P1-6 — GPS_LOST / weak-GPS banners stacking with duplicate wording

- Original: `src/views/components/navigation/NavigationChromeV2.tsx:161-169` — `GPS_LOST`
  and `isWeakGps` were two independent `&&` conditions that could both render simultaneously.
- Current: re-read `NavigationChromeV2.tsx` — the banner is now a single ternary chain:
  `gpsSignalState === 'GPS_LOST' ? <banner/> : isWeakGps ? <banner/> : null`, mutually
  exclusive by construction.
- **Classification: ALREADY FIXED.** Commit `52f4dac` ("fix: single-priority system status
  banners instead of stacking independent ones", 2026-09-21, closes #66) replaced the
  independent-`&&` chains across `NavigationChromeV1`, `NavigationChromeV2`, and
  `HomeScreen`'s browse-mode banners with priority ternaries (GPS_LOST > weak GPS > reroute
  status > basemap unavailable), and updated `NavigationChromeV1.test.tsx` /
  `NavigationChromeV2.test.tsx` accordingly. AUTOMATED TEST VERIFIED.
- Existing GitHub issue: #66 (closed).
- Remaining investigation: none.

## P1 count discrepancy — resolved

The original `agent-d-accessibility-review.md` executive summary claimed "P1 count: 9,"
but its own `## P1 list` section enumerates exactly 6 items (P1-1 through P1-6 above), with
an internal note already flagging the "9" figure as inconsistent with its own list. No
other file in the audit (visual-gap report, runtime-capture report) contains any additional
P1-tagged item. **Conclusion: the "9" is a self-acknowledged miscount in the original
document's executive summary, not evidence of missing entries.** All 6 P1s the document
actually documents are accounted for above; no findings were fabricated or omitted to
reach this conclusion, per this task's explicit instruction not to invent the missing 3.

## P2 findings — status, brief

Re-verification was not performed line-by-line for P2s (lower priority, time-boxed); status
below is SOURCE VERIFIED only where the underlying file was already read for a P1 above.

1. Category-chip row scroll affordance (`HomeScreen.tsx`, `chipsContent`) — not re-verified
   this pass. INSUFFICIENT EVIDENCE (current).
2. "Connected Blocks/Areas" chips styled identically to tappable chips
   (`LocationSheet.tsx:822-833`) — not re-verified. INSUFFICIENT EVIDENCE.
3. Urdu secondary map-label text at 8-9px (`mapLayerStyles.ts`) — not re-verified.
   INSUFFICIENT EVIDENCE.
4. Primary map-label text 11-13px, low end for outdoor legibility — not re-verified.
   INSUFFICIENT EVIDENCE.
5. Route Preview cognitive overload (up to 4 stacked cards, `LocationSheet.tsx`
   `RoutePreviewSection`) — not re-verified; also NOT TESTED at runtime in either audit
   (Route Preview was never captured). RUNTIME REVERIFICATION REQUIRED.
6. Offline/graph-fallback banner text small (12-14px) — not re-verified. INSUFFICIENT
   EVIDENCE.

## Visual findings (agent-c-visual-gap-analysis.md) — status

- **Basemap tiles failed to render in all 6 captures**, not just screen 02 as originally
  scoped — a shared, unresolved gap across every screenshot in the set. NOT TESTED against
  current HEAD (no new capture performed this session). RUNTIME REVERIFICATION REQUIRED.
- **North-up label pill crowds the zoom +/- pill when LocationSheet is open** — visually
  re-inspected screenshot `08-locationsheet-preview.png` directly this session: the
  "North-up" pill sits immediately above the zoom control with minimal clearance,
  consistent with the original finding's description of visual crowding. This confirms the
  *historical* screenshot shows what the audit says it shows; it does not confirm current
  behavior, since no new capture was taken. CHANGED BEHAVIOR POSSIBLE / RUNTIME
  REVERIFICATION REQUIRED.
- **Blue hyperlink-style badge text on non-tappable "Official entry gate" label** — visually
  confirmed in the same screenshot (`08-locationsheet-preview.png`): "Official entry / exit
  gate · Recommended entry point" renders in link-blue directly under the "Gate" subtitle.
  Not re-checked against current source/build. RUNTIME REVERIFICATION REQUIRED.
- **Screenshot 09 mislabeling** — independently re-confirmed this session (see
  `HISTORICAL_AUDIT_INVENTORY.md`); the true Details view remains unphotographed.
