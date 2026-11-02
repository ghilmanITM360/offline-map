# Remediation ledger — 2 November 2026

Issue[#395](https://github.com/ghilmanITM360/offline-map/issues/395). Native campaign[#394](https://github.com/ghilmanITM360/offline-map/issues/394).

## Ownership and Git scope

Starting local/tracking/live HEAD `2d9fa73874938a2d7483c4499ed0a1bddc3ba0bc`; exactly1 existing worktree/3 preserved stashes/protected untracked machine config. Latest owner instruction allows both PCs to read/write different tasks, forbids concurrent work on the same task. This overrides the older absolute HomeMac-only rule for this session. PC2 handles dependency reconciliation and output-path safety. No claim of a remote PC1 process inspection. Before pushes verify live remote parent and refuse incompatible advance. No branch/worktree/clone created, no history rewriting or protected branch mutation.

## PC2-ENV-01 — PASS (SOURCE/RUNTIME)

Root cause: stale installed dependency tree after source fast-forward.23 versions differed and4 applicable locked locations were absent. Preserved old installation; task-local CI Node24.14.0 exact-lock npm ci yields1079matches,0mismatches and only46foreign-platform omissions. Security14checks PASS; npm test PASS. See PC2_ENVIRONMENT_RECONCILIATION.md and hashes. No source/security-test change.

## PACK-OUTPUT-01 — PASS (SOURCE/RUNTIME)

Reproduction: real Karachi/demo builders given disposable directories containing unrelated-evidence.txt, with write true/false. All4 RED tests demonstrated deleted canary and successful generation. Raw pack-output-red.log. No dangerous real destination was passed to unguarded code.

Root cause: unconditional rmSync(outDir,recursive/force), prior to generation. `write:false` controlled manifest emission, not deletion. CLI resolved aliases before any guard.

Correction: scripts/sdk-pack/output.ts claims a new outside-repository directory; rejects every existing destination (including empty/protected evidence), lexical aliases and symlink traversal. Recognizes only exact OS-owned /var→/private/var and /tmp→/private/tmp aliases on macOS for standard temporary callers. Exclusive final mkdir rejects competing claims. Both compilers remove recursive deletion and pass raw CLI argument to guard. A failed generation may leave its newly created partial directory; reruns require a fresh destination. Existing files are never replaced.

Tests: SdkPackOutputSafety (18checks including4real-builder canary cases and2CLI cases); existing SdkKarachiPack/SdkDemoPack pin/reproducibility/gate-data tests. SdkEntryGateChooser now builds into fresh child of owned mkdtemp rather than replacing the temp root. Focused5suites64tests PASS. Independent read-only diff review: no actionable findings. No runtime SDK/app/native/GIS/manifest/pin/golden changes, so this compiler-only fix does not require rebuilding an existing verified binary; PC2 acceptance needs its own verified binary because historical HomeMac binaries are unavailable here.

## IOS-YOGA-01 — BLOCKED

Fresh correct-lock evaluation reproduces local5934998, not expected3fd22c2. Expected lock-producing JSON/environment unavailable. No speculative correction or install attempt. See IOS_YOGA_RESOLUTION.md for exact next action.

Final source chain: typecheck(app/scripts),lint(0errors/2existing warnings),npm test,full Jest223suites/2385tests,git diff --check,SDK package runtime/declarations/allowlist/Apache licence/reproducibility all PASS.2400differential and91506unchanged golden route comparisons,83headless/8exports/14security checks PASS. SOURCE_VALIDATION.json records exact commands/timing/log hashes. SDK tarball remains d722ce2541c3cd179cd0ce19ecf9536ec50481ace08beea3a0ef61f19dd29cca.

## Historical host branch review — retained separately

Existing complete PC2 BRANCH_SEMANTIC_REVIEW.md/UNMERGED_SOURCE_INVENTORY.md were read, not regenerated. A3-01 physical RTL overlay anchoring,EMU-N1 partial-detent inset lift andEMU-N3 measured footer fitting remain missing original-host mechanisms, overlapping their preserved consolidation patches. No ready-made SDK defect was reproduced from their absence; do not merge whole branches or silently change host authority. PR381 contains unique host acquisition/stationary recovery; SDK controller already performs its own acquisition/revalidation. PR380 is12unique host arrival characterization tests, not a production correction; field calibration remains pending. Existing superseded localization/older branches stay preserved. No NavigationViewModelV2 authority migration, Gate18/19 geometry or baseline/main mutation.

## ANDROID-CONFIG-01 — source corrected; native retest pending

Observed on fresh PC2candidateAAPK1be925a8fddcec6045b67c4fe07d12e25a420fe6edaa49a809fbd5e15f92007f: routeGate01→Gate02,manual step2,then systemfont_scale1→2 returned to directory. Generated consumer manifest lacksfontScale/smallestScreenSize/density; original host already handles them. Existing root helper is now shipped self-contained under consumer/plugins; root plugin forwards to it. Consumer app config registers it. No runtimeSDK/controller/GIS change. Real Expo config introspection regression RED1failed/3passed,thenGREEN4passed; no assertion relaxation. Read-only review found no actionable issues. Rebuild/retest must prove native journey retention before closure. CandidateAobservations are separate from the corrected binary.

ANDROID-CONFIG-01source gate: full required chainPASS,223suites/2386tests,91506unchanged routes,2400differential,83headless/8exports/14security;lint0errors/2existingwarnings;package byte identity unchanged. NATIVE_CONFIG_SOURCE_VALIDATION.json binds exact commands/logs. Native retest still pending at source commit.
