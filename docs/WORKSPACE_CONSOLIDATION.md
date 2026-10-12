# Single-checkout reconciliation — 2026-10-12

Permanent root: `/Users/ghilmanislam360/GhilmanProjects/offline-map`.
Origin: `https://github.com/ghilmanITM360/offline-map.git`.
Starting canonical: `8b7d76361251e7fba1e44880a5fb1daf72de796f`.
Recovered application canonical: `d7cafed977e1b0660b5efc915bd8dc66ca2cd618`.
Final campaign: 12 normal removals; registrations 13 → 5 → 3 → 1.

| Retired branch/checkpoint | Disposition |
| --- | --- |
| `codex/125-osm-provenance` | No unique commits; PR #226 merged. |
| `codex/131-current-runtime` | No unique commits; canonical descendant; no open PR needs local state. |
| `claude/l10n-directory` | Superseded #367/#373; history retained. |
| `claude/l10n-home-map` | Superseded #373; absent developer DebugOverlay is optional tooling. |
| `claude/l10n-navigation` | Superseded current semantic instructions/localization; old service-side translation not replayed. |
| `claude/l10n-sheets` | Superseded #368/#372/#373/current journey lifecycle. |
| `claude/docs-canonical` | Older restructure superseded #371/#374; newer acceptance docs retained. |
| `claude/l10n-app-shell` | Recovered #369/current permission policy. |
| Detached `42451f1` | Ten unique nonmerge/three merge commits; not exact patch-equivalent. Required behavior integrated differently; history retained. |
| `claude/l10n-all` (`final-base`) | Superseded localization aggregation; test drafts classified below and preserved. |
| `codex/307-rtl-cta` | Missing Button layout contract integrated through reviewed, exact-head CI-green #375; original draft preserved. |
| `claude/outside-nav-phase-20261006` | No unique commits; removed after dependent Button checkout. |

Detached history: manual gate retention integrated #162 (EV-028), provider joins #171 (EV-030), request identity canonical `4647ab9` (EV-029): [evidence ledger](audit/EVIDENCE_LEDGER.md). Current HomeScreen sheet guards and NavigationViewModel reroute/arrival authority supersede older alternatives. Optional fallback-place metadata/persistence optimizations remain preserved future-work evidence, not mandatory missing features.

## final-base drafts

All 22 modified scripts are test infrastructure/evidence, not production or data generation.

| Classification | Files under `scripts/` |
| --- | --- |
| Superseded import-only adaptation | `test-directions-buttons-v2.ts`, `test-directions-ux.ts`, `test-directions-v2.ts`, `test-home-buttons-v2.ts`, `test-home-controls.ts`, `test-map-object-selectability-v2.ts`, `test-navigation-v2.ts`, `test-outside-location-routing-v2.ts`, `test-route-preview-v2.ts` |
| Superseded localization syntax; canonical asserts semantic keys | `test-critical-actions.ts`, `test-home-ux.ts`, `test-keyboard-layout.ts`, `test-map-labels-v2.ts`, `test-map-localization-v2.ts`, `test-map-stage3-finalization-v2.ts`, `test-outside-banner-gate-v2.ts`, `test-selected-block-contrast-v2.ts`, `test-settings-guide.ts`, `test-settings-ui.ts`, `test-ui-components.ts` |
| Historical bidi-isolate test evidence | `test-street-instructions-v2.ts`, `test-street-instructions-routeindex-v2.ts` |
| Experimental untracked helper | `lib/englishSource.ts`: global fs.readFileSync translation monkeypatch; preserved, not integrated. |

## Recovery and removal evidence

Recovery root: `/Users/ghilmanislam360/.codex/recovery/ijtema-final-consolidation-20261012T080451Z` (restricted storage outside source). Original archives were not overwritten. This durable local archive is protected by mode 0700; the earlier temporary path is a compatibility alias. It is not a remote backup.

- `inventory.json`, `completed-inventory.json`: HEADs, unique commits, patch equivalence, status and dispositions.
- `SHA256.json`: verified original patches, staged patches, untracked copies and bundle.
- `history.bundle`, `reconciled-history.bundle`, `final-preserved-history.bundle`: verified history, detached HEADs/recovery refs. Original branches remain.
- `refs/recovery/ijtema-20261012/worktree-2-draft`: original Button draft.
- `refs/recovery/ijtema-20261012/worktree-3-draft`: detached configuration.
- `refs/recovery/ijtema-20261012/worktree-12-draft`: 22 scripts and helper.
- `retirement-actions.json`: all 12 normal Git removals; each required no active lsof ownership, no worktree/admin lock, clean state after verified draft preservation, no dependent checkout link and no open PR requiring local state.
- Per-checkout `retired-ignored`: private config/build evidence hashes; caches retained by same-device/same-inode rename, not copied as valuable source.
- `main-stale-native-cache`: intact ignored CocoaPods cache; 68 pre-existing broken generated header links; no tracked source/live process involved.
- `single-root-structure.json`: one root, no nested repos/broken active links, known environment disposition and verified config/evidence hashes.
- `single-checkout-validation/results.json`: actual commands, exits and source SHA.

No credentials/private config contents were committed or published. No branches were deleted. Open PRs #178/#179 remain protected. Native/field/security acceptance stays pending: [current status](PROJECT_STATUS.md).
