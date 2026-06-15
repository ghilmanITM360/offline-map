/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { buildNavigationGraphV2 } from './graphBuilder';

const builtGraph = buildNavigationGraphV2();

export const IJTEMA_NAVIGATION_GRAPH_V2 = builtGraph.graph;
export const IJTEMA_NAVIGATION_GRAPH_V2_REPORT = builtGraph.report;

export * from './graphTypes';
export {
  NAVIGATION_GRAPH_V2_VERSION,
  buildNavigationGraphV2,
  distanceMeters,
  findNearestGraphNode,
  getBlockEntryNodeIds,
} from './graphBuilder';
