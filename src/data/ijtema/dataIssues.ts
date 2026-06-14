/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { DataIssue } from './types';

export const DATA_ISSUES: DataIssue[] = [
  {
    id: 'RASTA_09_SOURCE_POINT_ID_TYPO',
    severity: 'info',
    category: 'source_typo',
    affectedIds: ['R9-01', 'R9-02', 'R9-03', 'R9-04', 'R9-05', 'R9-06', 'R9-07', 'R9-08', 'R9-09'],
    summary: 'The supplied Rasta 09 labels reused R6-01 through R6-09 IDs.',
    resolution: 'Normalized IDs to R9-01 through R9-09 while preserving coordinates and sequence.',
  },
  {
    id: 'SPNP_03_DUPLICATE_SOURCE_ID',
    severity: 'warning',
    category: 'duplicate_source_id',
    affectedIds: ['SPNP-03', 'SPNP-04', 'SPNP-05', 'SPNP-06', 'SPNP-07'],
    summary: 'The supplied Shahr-e-Pindal North list repeats SPNP-03 for two different coordinates.',
    resolution: 'Preserved coordinate order and normalized the sequence to SPNP-01 through SPNP-07.',
  },
  {
    id: 'GATE_13_14_NEAR_DUPLICATE',
    severity: 'warning',
    category: 'near_duplicate',
    affectedIds: ['GATE_13', 'GATE_14'],
    summary: 'Gate 13 and Gate 14 coordinates are nearly identical in the supplied dataset.',
    resolution: 'Kept both user-intended gates as routable official gates and marked both source coordinates as needs_verification.',
  },
  {
    id: 'POLYGON_CORNER_ORDER_NORMALIZED',
    severity: 'info',
    category: 'geometry',
    affectedIds: ['B1-B42'],
    summary: 'Several supplied C1/C2/C3/C4 corner orders are access-point oriented rather than polygon-winding oriented.',
    resolution: 'Generated renderable polygons by sorting supplied corners around each block center.',
  },
];
