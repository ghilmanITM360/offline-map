# R7/R8 Ground-Truth Integration — 2026-08-14

The owner-supplied coordinates are represented as separate surveyed segments. Numeric IDs do not imply adjacency across segments.

## Chosen topology

```text
Existing R7 spine:  R7-01 → R7-02 → R7-03 → R7-04
                                    ↕ 3.0 m surveyed junction
R7 transverse:      R7-05 → R7-06 → R7-07 → R7-08
                       ↕ 7.0 m          ↕ 1.1 m
                     R6-02             R8-03

R8 north transverse: R8-04 → R8-05 → R8-06
                        ↕ 9.5 m  ↕ 2.8 m
                      R7-01    R8-01

Existing R8 spine:    R8-01 → R8-02 → R8-03
                                  ↕ 2.9 m
R8 mid transverse:    R8-07 → R8-08 → R8-09 → R8-10
                         ↕ 2.8 m
                       R7-02
```

The 7.0 m, 9.5 m, 1.1 m, and 2.8 m cross-Rasta intersections are created by the graph builder's conservative 12 m intersection rule. The three same-Rasta links are explicit surveyed junctions because automatic proximity linking intentionally ignores points in the same logical route family.

Forbidden artificial edges are regression-tested: `R7-04→R7-05`, `R8-03→R8-04`, and `R8-06→R8-07`.

## Baseline route evidence

The before snapshot was captured from effective baseline `dd564531` plus the protected BottomSheet patch in `/tmp/ijtema-route-baseline-before.jsonl`. The committed regression script records each exact before distance, current distance, delta, and the new surveyed nodes that explain every shortening.

This document records source geometry and calculated graph behavior. Physical wayfinding remains subject to device QA and field verification.
