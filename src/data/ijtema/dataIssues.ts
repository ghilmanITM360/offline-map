/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { DataIssue } from './types';

export const DATA_ISSUES: DataIssue[] = [
  {
    id: 'MISSING_GATE_COORDINATES',
    severity: 'warning',
    category: 'missing_coordinate',
    affectedIds: ['GATE_06', 'GATE_09', 'GATE_10', 'GATE_11', 'GATE_12', 'GATE_15'],
    summary: 'The supplied dataset claims Gates 01-22, but six gate coordinates are not present.',
    resolution:
      'Represented as status=missing_coordinate and routingStatus=missing_coordinate with no synthetic coordinate or outside-route start capability.',
  },
  {
    id: 'B24_DUPLICATE_C2_C3',
    severity: 'warning',
    category: 'geometry',
    affectedIds: ['B24'],
    summary: 'The supplied B24 text has identical C2 and C3 coordinates, which would make the source corner set degenerate.',
    resolution: 'Kept the supplied entry points for auditability and used the existing verified app B24 polygon for rendering.',
  },
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
    id: 'SPSP_03_DUPLICATE_SOURCE_ID',
    severity: 'warning',
    category: 'duplicate_source_id',
    affectedIds: ['SPSP-03', 'SPSP-04', 'SPSP-05', 'SPSP-06', 'SPSP-07', 'SPSP-08'],
    summary: 'The supplied Shahr-e-Pindal South list repeats SPSP-03 for two different coordinates.',
    resolution: 'Preserved coordinate order and normalized the sequence to SPSP-01 through SPSP-08.',
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
    resolution: 'Generated renderable polygons by sorting supplied corners around each block center, with B24 using a verified fallback polygon.',
  },
  {
    id: 'PRP_POINTS_NOT_PROVIDED',
    severity: 'info',
    category: 'source_gap',
    affectedIds: ['PRP'],
    summary: 'The source description mentions PRP/Paidal Rasta Points, but no PRP coordinates were supplied in the text dataset.',
    resolution: 'No fake PRP points were created. Add PRP as a special route when coordinates are provided.',
  },
];
