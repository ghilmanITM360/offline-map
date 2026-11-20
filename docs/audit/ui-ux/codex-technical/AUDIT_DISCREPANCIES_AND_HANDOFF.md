# Audit Discrepancies and Claude Handoff

## Independent discrepancies against existing audit documentation

1. **True Details gap is now closed for Block 13.** Existing master documents correctly say the earlier `09-*.png` was mislabeled and true Details was unphotographed. This pack independently captures the actual expanded Details state in `18-block13-true-details.png`.
2. **Cancel Route defect was absent from the master audit search.** CTF-005 is new: confirmed cancellation leaves a stale local route card and removes Cancel Route.
3. **Cross-screen LocationSheet leak was absent from the master audit search.** CTF-006 is new: an open Home sheet overlays the pushed Offline Maps screen.
4. **Base-map result differs by artifact credential context.** Master evidence says the historical clean SHA `0fffa523…` sometimes rendered tiles. This audit’s freshly built debug-signed SHA `82907c67…` consistently produced Maps SDK `INVALID_ARGUMENT` and graph-only mode. Do not merge these into one claim; certificate/key restriction context differs.
5. **GPS blocker independently reproduced.** The new controlled test narrows evidence further: emulator console accepted commands, but Android GPS/fused last location and app-attributed provider events did not update. This supports an environment boundary, not an established app defect.
6. **Existing runtime claims from the injected historical APK remain excluded.** No `TestLocationInjector`, `scenarioRunner`, or runtime-injection strings were found in either the pulled historical clean artifact or this freshly built artifact.
7. **Legal placeholder behavior confirmed, not newly authored.** Privacy/Terms remain owner-content blocked; the app safely reports the link is unconfigured.

## Preflight / repository state

- Canonical: `integration/ijtema-clean-baseline` at `1599c324b7b5cfc1a0a92b4b1158382d4a7a2b81`.
- Historical Claude audit checkout: `docs/ui-ux-audit-reconciliation` at `1995fa7353...`, nine commits ahead of canonical at audit start and dirty only with unrelated `.superpowers/` content. It was not modified.
- Open PRs inspected read-only: #152 (`docs/ui-ux-audit-reconciliation`), #138 (`docs/ticket-reconciliation-matrix`), #121 (`fix/v2-data-structural-validation`), all targeting canonical.
- `docs/PROJECT_STATUS.md` reports an older `1a5cfd8` snapshot and is not current for this run.

## Handoff to Claude

Reconcile CTF-005 and CTF-006 first because both are new, trusted-build emulator findings with source-supported mechanisms. Update the master true-Details row using `18-block13-true-details.png`. Preserve the GPS classification as ENVIRONMENT BLOCKED; do not convert it into a product bug without Android provider delivery. Do not reuse injected-APK reroute evidence.

Still open:

- fresh-GPS success;
- active navigation text/controls/compass;
- reroute and GPS recovery;
- arrival/Done/second journey;
- rasta and special-route runtime selection;
- Urdu keyboard input in Directory under a trustworthy input method;
- TalkBack speech/focus/live announcement;
- font-scale and touch-target runtime pass;
- physical-device and field verification.

No GitHub issue, Project item, production source or Claude-owned audit file was modified.
