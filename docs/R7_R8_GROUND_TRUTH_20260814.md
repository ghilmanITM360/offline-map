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

The before snapshot was captured from effective baseline `dd564531` plus the protected BottomSheet patch. The committed regression script records each exact before distance, current distance, delta, and the new surveyed nodes that explain every shortening.

For compact exact paths below, these suffixes expand as follows:

```text
OLD = R7-04 → SPSP-06 → SPSP-05 → SPSP-04 → SPSP-03 → SPSP-02
      → R1-01 → R1-02 → R1-03 → R10-01 → R10-02 → R10-03
      → R3-03 → R3-04 → P10 → B15_C3

NEW = R6-02 → R6-03 → R6-04 → R6-05 → R6-06
      → R11-08 → R11-07 → R11-06 → P11 → B15_C4
```

| Start | Before exact node path | After exact node path | Before | After | Delta |
|---|---|---|---:|---:|---:|
| Gate 01 | `GATE_01 → R6-01 → NEW` | unchanged | 1,111m | 1,111m | 0m |
| Gate 02 | `GATE_02 → R6-01 → NEW` | unchanged | 1,182m | 1,182m | 0m |
| Gate 20 | `GATE_20 → NPC-02 → NPC-01 → R7-01 → R7-02 → R7-03 → OLD` | `GATE_20 → R8-06 → R8-05 → R8-01 → R8-02 → R8-03 → R7-07 → R7-06 → R7-05 → NEW` | 2,102m | 1,568m | -534m |
| Gate 21 | `GATE_21 → NPC-02 → NPC-01 → R7-01 → R7-02 → R7-03 → OLD` | `GATE_21 → NPC-02 → R8-01 → R8-02 → R8-03 → R7-07 → R7-06 → R7-05 → NEW` | 1,897m | 1,366m | -531m |
| Gate 22 | `GATE_22 → NPC-01 → R7-01 → R7-02 → R7-03 → OLD` | `GATE_22 → NPC-01 → R7-01 → R7-02 → R7-03 → R7-06 → R7-05 → NEW` | 1,718m | 1,187m | -531m |
| Block 26 | `B26_C3 → R7-02 → R7-03 → OLD` | `B26_C3 → R8-07 → R7-02 → R7-03 → R7-06 → R7-05 → NEW` | 1,542m | 1,012m | -530m |
| Block 27 | `B27_C1 → R8-01 → NPC-02 → NPC-01 → R7-01 → R7-02 → R7-03 → OLD` | `B27_C3 → R8-02 → R8-03 → R7-07 → R7-06 → R7-05 → NEW` | 1,981m | 1,184m | -797m |
| Block 28 | `B28_C3 → R7-03 → OLD` | `B28_C3 → R7-03 → R7-06 → R7-05 → NEW` | 1,464m | 933m | -531m |
| Block 29 | `B29_C1 → R8-02 → R8-01 → NPC-02 → NPC-01 → R7-01 → R7-02 → R7-03 → OLD` | `B29_C3 → R7-07 → R7-06 → R7-05 → NEW` | 2,086m | 1,093m | -993m |

The new family transition is therefore explainable: north/east starts use the supplied R8/R7 transverse segments, join R6 at the measured R7-05/R6-02 junction, and finish through R11. Gate 01 and Gate 02 never need the new geometry and remain byte-for-byte path-equivalent.

This document records source geometry and calculated graph behavior. Physical wayfinding remains subject to device QA and field verification.
