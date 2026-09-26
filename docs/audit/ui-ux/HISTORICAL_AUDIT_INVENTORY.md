# Historical UI/UX Audit Inventory — "premium-map-audit" (September 5, 2026)

## Provenance

This audit was produced by a prior Claude session and stored locally at
`.superpowers/premium-map-audit/`, which was **never committed to git** (confirmed
untracked via `git status`) and consequently never referenced by any project doc,
including `MASTER_TICKET_MATRIX.md`, which as of the `docs/ticket-reconciliation-matrix`
branch (PR #138) states #128 has "zero prior doc coverage." That statement was accurate
for tracked/committed material but did not account for this untracked audit.

This document preserves the original audit's provenance and contents as-is. It does not
re-verify findings against current source — see `HISTORICAL_FINDINGS_RECONCILIATION.md`
for that.

- Original location: `.superpowers/premium-map-audit/` (left in place, untracked, not deleted)
- Original dates: `runtime-capture-report.md` mtime Sep 5 02:37am; `agent-c-visual-gap-analysis.md`
  mtime Sep 5 11:15am; `agent-d-accessibility-review.md` mtime Sep 5 11:16am
- Branch the audit was performed against: `integration/ijtema-clean-baseline`
- App/package under test: `com.aicrafted.karachiijtema`, Pixel_10_Pro emulator (emulator-5554)
- This archive was assembled 2026-09-26, on branch `docs/ui-ux-audit-reconciliation`,
  off canonical HEAD `1599c32`

## Files recovered

| Original file | Size | Contents |
|---|---|---|
| `runtime-capture-report.md` | 3,776 bytes | Screenshot capture log: 6 of 16 planned screens captured, 10 not reached, reasons given for each, environment notes |
| `agent-c-visual-gap-analysis.md` | 20,272 bytes | Pixel-level visual/design review of the 6 captured screenshots: per-screen 12-dimension scoring table, KEEP/POLISH/REDESIGN verdicts, ranked highest-impact changes, low-value changes to avoid, 12 direct answers to map-design questions |
| `agent-d-accessibility-review.md` | 21,065 bytes | Accessibility + elderly-usability review: executive score, runtime-backed findings, code-only findings, P0/P1/P2 lists, 8 recommended fixes, physical-device-validation requirements, TalkBack/font-scaling test requirements |
| `screenshots/*.png` (6 files) | — | The 6 actual emulator captures, copied into this archive at `docs/audit/ui-ux/screenshots/` after a manual sensitivity check (no PII, no device identifiers beyond generic status-bar icons, no real GPS/location data — synthetic Ijtema venue data only) |

No additional files were found beyond these three reports and six screenshots.

## Screens planned vs. captured

16 screens were planned. 6 were captured; 10 were not, per `runtime-capture-report.md`:

**Captured (6):**
1. `02` — Explore Map (idle) → `02-explore-map-BLOCKED-basemap.png` — basemap tiles did not render (Google Maps API/network path not exercised in that capture session); chrome/markers/controls are real, basemap appearance is not
2. `03a` — Search entry → `03a-search-entry.png`
3. `03b` — Search with query → `03b-search-with-query.png`
4. `05` — Gate selected → `05-gate-selected.png`
5. `08` — LocationSheet preview → `08-locationsheet-preview.png`
6. `09` — LocationSheet "details" → `09-locationsheet-details.png` — **mislabeled**; see below, this is a second preview-mode capture, not the true Details view

**Not captured (10), reasons per original report:**
- `01` Locations Directory — not attempted before session cutoff
- `04` Block selected — not reached
- `06` Rasta selected — not reached
- `07` Shahr-e-Pindal selected — not reached, unclear if this place/category exists in seed data
- `10` Route calculating — not reached
- `11` Route Ready / Route Preview — not reached
- `12` Active Navigation — not reached
- `13` GPS warning — not reached, emulator GPS behavior unverified
- `14` Offline / graph fallback — not reached, trigger mechanism unconfirmed
- `15` Arrival — not attempted, would need `adb emu geo fix` near a destination
- `16` Drawer / secondary nav — not reached, existence in production unconfirmed

The capture session was manually cut off by its controller after ~1h when the capture
agent got stuck re-doing screen 09 in a "perfectionism loop" after being told twice to
move on. The report states this explicitly and that what's documented is "genuinely
captured, not padded."

## Known evidence-integrity issue: screenshot 09 mislabeling

`09-locationsheet-details.png` was logged in `runtime-capture-report.md` as showing the
Details view ("reached via the Details pin-icon action... verified against
`LocationSheet.tsx` — `isDetails=true` → back chevron, 'Block information', 'Connected
Rastay'/'Nearby Gates'"). Independently re-inspected here (this session, viewed the raw
PNG directly): the image shows **no back chevron and no "Block information" section** —
it shows the same `preview`-mode structure as screenshot 08 (title, badges, green
Directions CTA, Save/Share/Details icon row), for Gate 07 instead of Gate 05. This matches
`agent-c-visual-gap-analysis.md`'s own finding, which caught the same discrepancy by
reading `LocationSheet.tsx:870-873` (`{!isDetails && ...}` gates the Details button itself,
consistent with what's on screen).

**The true LocationSheet Details view (back chevron, Block information, Connected Rastay,
Nearby Gates) has never been screenshotted, by this audit or any other.** Any future
coverage matrix must mark it unverified, not reuse screenshot 09 as evidence.

## Finding counts as originally stated

`agent-d-accessibility-review.md`'s executive summary states "A11Y-P1 count: 9. A11Y-P2
count: 6." The document's own `## P1 list` section, however, enumerates exactly 6 items,
with a parenthetical note under the list: *"(Items 5 of the 'O findings above P1' — total
6 explicit P1s; two additional touch-target-adjacent items below are P2, not P1, since
existing hitSlop/padding already meets the 44dp floor in those cases.)"* No other P1-tagged
finding exists anywhere else in either the accessibility or visual-gap report. The "9" in
the executive summary is an internal miscount in the original document, not a sign that 3
findings were dropped from the list — see `HISTORICAL_FINDINGS_RECONCILIATION.md` for the
full resolution of this discrepancy. The P2 count (6) matches its own list exactly.
