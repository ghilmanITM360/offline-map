# Core benchmark results — issue #119

**SOURCE/RUNTIME VERIFIED** — desktop Node/V8 measurements only. No performance budget or optimization decision is established; Android/Hermes, emulator, physical-device and field performance remain unverified.

Measured 2026-09-30T16:33:43.057Z against production source HEAD `de8cc34978473ea96bf0ea6cfddf7caeb5edc71b` with the measurement-only harness in this change. Apple M1 Pro, 8 logical CPUs, arm64, darwin 25.5.0, Node v24.14.0, 16 GiB RAM. Machine load was uncontrolled; CPU temperature, clock and background work were not pinned.

Reproduce from the repository root:

```bash
node --expose-gc --import tsx scripts/benchmark-core.ts /private/tmp/119-results.json
```

Raw samples and full memory snapshots: `/private/tmp/119-results.json` (local ephemeral output, SHA-256 `f6a564f43435228c883bf7183febf7cdd50e4926e73378c6a82a71905cc4219d`). Rerunning writes the raw JSON after each completed child. A failed or timed-out child stops the run with a nonzero exit; every child has a 120-second timeout.

## Method and fixture boundaries

Each workload/size runs in a fresh subprocess. Imports, the bundled graph built during service module loading, synthetic fixture creation, forced GC, correctness assertions and subprocess overhead are excluded from timed samples. The harness imports and calls the actual `SearchService.search`, `FuzzySearchService.matches`, `V2PlaceAdapter.getAllPlaces` and `buildNavigationGraphV2`; it neither copies algorithms nor changes production code or APIs. Exported dataset arrays are replaced in child memory only and discarded at process exit.

Search has no index. “Build” measures actual cold production adapter place-cache construction: one warmup and five measured builds, clearing only private adapter caches between builds. Each query uses five warmups and 30 individually timed calls; timings include production scan, fuzzy comparisons and sorting. Nearest-rank p95 is sample 29 of 30 for queries, and the maximum of five samples for builds; build tail estimates have weak statistical confidence. Median of five is the middle sample, and median of 30 is the upper middle sample.

Synthetic search contains exactly N blocks/destinations, each with a 16-character ASCII name, equal Urdu/roman labels, one 10-character alias and four polygon coordinates. The target name is `benchmarktarget` (15 characters), ID `B100`. Exact (`benchmarktarget`), prefix (`benchmark`) and fuzzy (`benchmarktargex`) each assert the target is present; they produce one hit in this fixture. The 12-character `zzzzzzzzzzzz` miss returns zero and exercises Levenshtein against 16-character destination names. The separate 20-character miss is a cheap length rejection for the shorter fixture words. This does not measure broad many-hit ranking, multilingual behavior, mixed category conversion or per-rasta connected-block scanning. The cached real graph remains loaded but block conversion does not consult it; these timings do not establish synthetic routing eligibility.

The unchanged real dataset baseline contains 74 adapter destinations and 303 graph nodes at this HEAD. Real queries are exact `Block 42`, prefix `Block`, fuzzy `blok`, fuzzy miss `zzzzzz`, and long rejection `zzzzzzzzzzzzzzzzzzzz`. Each hit case asserts B42 is present; both misses assert zero.

Synthetic graph N is exact output node count, not destination count. Four rasta groups contain N − 4×floor(N/20) walkable points; floor(N/20) blocks contribute four entry nodes each. No gates, central points, special routes or perimeter connectors are included. Walkable points are on a deterministic grid near latitude/longitude zero with 0.0004-degree spacing and interleaved route groups. Nonempty four-corner polygons are offset 0.00006–0.00012 degrees from each block’s grid point. These are fictional geometry for computation, never venue GIS or confirmed pedestrian connections. They exercise intersection pair loops, candidate distance sorting, polygon checks against other blocks, block connector creation and adjacency construction; each graph asserts exactly N nodes, exactly four reports per block, and all block entries connected. Sparse grid geometry avoids dense intersection edge explosion; rejected candidate/polygon worst cases and the real gate/central mix are not scale-tested.

Graph has one warmup and five measured builds at every size, with forced GC before each measured build. The final graph is held through memory snapshots. No samples were reduced or timed out. All 16 workload children and their assertions completed.

Memory baseline is post-import/post-fixture forced-GC heap. Graph also records a post-warmup build baseline used for its deltas. “Uncollected delta” includes live output plus temporary allocation; “retained delta” is after explicit GC, relative to that workload baseline. Search retention includes the adapter cache and result/timing bookkeeping; graph retention includes final graph/report and timing bookkeeping. These are process heap observations, not pure index/graph object sizes. RSS peak is the child’s process-lifetime OS high-water mark (including tsx, imports, bundled graph and fixtures), not an operation peak. No asynchronous sampler can observe synchronous allocation peaks here.

## Search results

Times are milliseconds; each cell is median / p95.

| Destinations | Dataset | Cold cache build | Exact | Prefix | Fuzzy | Fuzzy miss | Long reject |
|---:|---|---:|---:|---:|---:|---:|---:|
| 74 | bundled-real | 0.819 / 0.889 | 0.016 / 0.023 | 0.511 / 0.875 | 0.751 / 1.898 | 0.930 / 1.335 | 0.100 / 0.176 |
| 50 | fictional-synthetic | 0.117 / 0.811 | 0.615 / 0.992 | 0.652 / 0.796 | 0.628 / 1.034 | 0.505 / 0.733 | 0.021 / 0.036 |
| 100 | fictional-synthetic | 0.095 / 0.108 | 1.304 / 1.656 | 1.451 / 1.775 | 1.260 / 1.620 | 1.052 / 1.164 | 0.036 / 0.083 |
| 300 | fictional-synthetic | 0.116 / 0.395 | 3.945 / 5.262 | 4.142 / 5.013 | 3.802 / 4.540 | 3.224 / 3.599 | 0.113 / 0.324 |
| 500 | fictional-synthetic | 0.125 / 0.534 | 12.870 / 61.148 | 7.585 / 12.934 | 7.168 / 9.580 | 6.549 / 8.509 | 0.171 / 0.285 |
| 1000 | fictional-synthetic | 0.246 / 0.711 | 15.745 / 29.212 | 17.626 / 22.342 | 18.695 / 33.650 | 13.412 / 18.093 | 0.337 / 0.789 |
| 2000 | fictional-synthetic | 0.506 / 0.808 | 27.009 / 31.674 | 29.173 / 37.922 | 24.978 / 27.227 | 20.969 / 23.347 | 0.676 / 0.765 |
| 5000 | fictional-synthetic | 0.819 / 1.447 | 78.190 / 143.615 | 86.390 / 172.325 | 63.635 / 75.010 | 51.725 / 64.378 | 1.989 / 3.085 |

## Graph results

| Nodes | Dataset | Blocks | Walkable points | Edges | Connected block entries | Warnings | Build median / p95 (ms) |
|---:|---|---:|---:|---:|---:|---:|---:|
| 303 | bundled-real | 42 (bundled) | mixed bundled types | 343 | 168 | 2 | 10.320 / 14.165 |
| 50 | fictional-synthetic | 2 | 42 | 46 | 8 | 0 | 0.781 / 1.117 |
| 100 | fictional-synthetic | 5 | 80 | 96 | 20 | 0 | 2.029 / 2.274 |
| 300 | fictional-synthetic | 15 | 240 | 296 | 60 | 0 | 14.827 / 17.023 |
| 500 | fictional-synthetic | 25 | 400 | 496 | 100 | 0 | 61.069 / 75.967 |
| 1000 | fictional-synthetic | 50 | 800 | 996 | 200 | 0 | 217.011 / 230.123 |
| 2000 | fictional-synthetic | 100 | 1600 | 1996 | 400 | 0 | 796.584 / 808.485 |
| 5000 | fictional-synthetic | 250 | 4000 | 4996 | 1000 | 0 | 6788.677 / 7630.194 |

## Memory observations

MiB = 1,048,576 bytes. Baseline excludes synthetic fixture creation from the delta, but fixture memory remains resident.

| Workload | Size | Baseline heap MiB | Uncollected delta MiB | Retained delta MiB | Peak RSS MiB |
|---|---:|---:|---:|---:|---:|
| search | 74 | 10.235 | 2.169 | 0.186 | 94.391 |
| graph | 303 | 9.646 | 6.637 | 0.390 | 95.266 |
| search | 50 | 9.638 | 0.723 | 0.103 | 79.031 |
| graph | 50 | 9.557 | 1.270 | 0.055 | 79.938 |
| search | 100 | 9.649 | 3.121 | 0.181 | 78.812 |
| graph | 100 | 9.574 | 4.570 | 0.124 | 81.859 |
| search | 300 | 9.826 | 4.581 | 0.305 | 87.391 |
| graph | 300 | 9.658 | 5.510 | 0.361 | 101.484 |
| search | 500 | 10.003 | 5.869 | 0.444 | 87.234 |
| graph | 500 | 9.706 | 7.602 | 0.541 | 102.766 |
| search | 1000 | 10.451 | 6.208 | 0.769 | 89.609 |
| graph | 1000 | 9.867 | 11.995 | 1.032 | 114.516 |
| search | 2000 | 11.350 | 3.213 | 1.351 | 89.922 |
| graph | 2000 | 10.142 | 26.142 | 1.987 | 148.328 |
| search | 5000 | 14.014 | 9.709 | 3.220 | 110.938 |
| graph | 5000 | 10.950 | 22.611 | 4.866 | 214.391 |

The observed growth is workload-specific. At 5,000 synthetic graph nodes the connector-heavy build takes seconds on this desktop; the real bundled baseline is much smaller. This establishes desktop scale evidence for EV-024/EV-027, not a present device bottleneck, a migration recommendation or a pass/fail budget.

Recommendation: **NO-GO for an optimization change at the current dataset size based on this evidence alone.** The real desktop baseline (74 destinations / 303 nodes) does not establish a user-visible bottleneck, and no near-term dataset forecast or owner-approved latency budget exists. **GO for a focused scaling investigation before a planned move to thousands of nodes/destinations:** the synthetic 5,000-node graph median is 6,788.677 ms and 5,000-destination query medians are tens of milliseconds. Validate that planned workload on Android/Hermes and agree a budget before choosing an index or changing construction. This is an engineering recommendation, not a product-policy or architecture decision.

Harness validation: `npm run typecheck` passes app and scripts; `eslint scripts/benchmark-core.ts` and `git diff --check` pass. The parent task runs required repository-wide validation before final handoff.
