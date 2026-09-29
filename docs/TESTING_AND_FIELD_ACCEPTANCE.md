# Testing and Field Acceptance

## Evidence discipline

No PASS claim without a real run on that build, that day, with evidence (screenshot/log) if it's a device/emulator claim. Passing `typecheck`/`lint`/Jest is SOURCE-level verification only — it is not runtime, device, or field verification. See the evidence-level table in `AGENTS.md`; label every claim with its actual level.

Roughly half of the `scripts/test-*-v2.ts` "high-value script suite" checks are `readFileSync`-based string/structure assertions against source, not renders — useful as regression guards, but they don't substitute for an actual run.

## Required commands

```bash
npm run typecheck
npm run lint
npm test
npm run test:components -- --runInBand
git diff --check
```

Routing changes additionally require:

```bash
npm run test:all-gates-v2
npm run test:outside-street-gate-selection-cost-v2
npm run test:core-provider-routing-contract-v2
npm run test:reroute-v2
```

Current baseline (see `docs/PROJECT_STATUS.md` for the live snapshot): 51 Jest suites / 550 tests.

## Release-build-only rule

Any offline-behavior sign-off must come from a real release build (`npm run android:release:apk`), never from `expo run:android` (dev builds behave differently, especially around bundling/offline behavior). Required flags for the v2 runtime: `EXPO_PUBLIC_USE_IJTEMA_V2_*=true`.

## Manual QA checklist shape

Reusable section structure for a manual pass: Installation → Home → Search → Directions → Navigation → Offline → Settings → Regression. Fill it fresh for each real test cycle; do not reuse a prior cycle's rows as if they still apply to the current build.

For the Navigation rows, run both V1 (legacy Block destination) and V2 (Gate/facility destination) with TalkBack on, on a small screen and at maximum font scale. The specific items are the device accessibility checklist in `docs/KNOWN_LIMITATIONS_AND_OWNER_ACTIONS.md`; none has been run on a device yet.

## Field acceptance

Physical walking acceptance at the actual venue (#46) and physical-device LOC-01..12 verification (#45) are open and cannot be completed from a development environment — see `docs/KNOWN_LIMITATIONS_AND_OWNER_ACTIONS.md`.
