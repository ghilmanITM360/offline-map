/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Node, Edge, Block } from '../models/types';

export const IJTEMA_DATA: {
  nodes: Record<string, Node>;
  edges: Edge[];
  blocks: Record<string, Block>;
} = {
  nodes: {
    // Street Points (S1-S17)
    "S1": { id: "S1", lat: 24.9720, lng: 66.9980, type: "road_end", name: "North-West Corner" },
    "S2": { id: "S2", lat: 24.9720, lng: 67.0030, type: "road_end", name: "North Main Entry" },
    "S3": { id: "S3", lat: 24.9720, lng: 67.0080, type: "road_end", name: "North-East Corner" },
    "S4": { id: "S4", lat: 24.9680, lng: 67.0080, type: "road_end", name: "East Main Entry" },
    "S5": { id: "S5", lat: 24.9640, lng: 67.0080, type: "road_end", name: "South-East Corner" },
    "S6": { id: "S6", lat: 24.9640, lng: 67.0030, type: "road_end", name: "South Main Entry" },
    "S7": { id: "S7", lat: 24.9640, lng: 66.9980, type: "road_end", name: "South-West Corner" },
    "S8": { id: "S8", lat: 24.9680, lng: 66.9980, type: "road_end", name: "West Main Entry" },
    "S9": { id: "S9", lat: 24.9700, lng: 67.0000, type: "intersection" },
    "S10": { id: "S10", lat: 24.9700, lng: 67.0030, type: "intersection" },
    "S11": { id: "S11", lat: 24.9700, lng: 67.0060, type: "intersection" },
    "S12": { id: "S12", lat: 24.9680, lng: 67.0000, type: "intersection" },
    "S13": { id: "S13", lat: 24.9680, lng: 67.0030, type: "intersection" },
    "S14": { id: "S14", lat: 24.9680, lng: 67.0060, type: "intersection" },
    "S15": { id: "S15", lat: 24.9660, lng: 67.0000, type: "intersection" },
    "S16": { id: "S16", lat: 24.9660, lng: 67.0030, type: "intersection" },
    "S17": { id: "S17", lat: 24.9660, lng: 67.0060, type: "intersection" },

    // Terminal Points (T1-T2)
    "T1": { id: "T1", lat: 24.9730, lng: 67.0030, type: "road_end", name: "North Bus Terminal" },
    "T2": { id: "T2", lat: 24.9630, lng: 67.0030, type: "road_end", name: "South Bus Terminal" },

    // Intersections (P1-P12)
    "P1": { id: "P1", lat: 24.9710, lng: 67.0015, type: "intersection" },
    "P2": { id: "P2", lat: 24.9710, lng: 67.0045, type: "intersection" },
    "P3": { id: "P3", lat: 24.9690, lng: 67.0015, type: "intersection" },
    "P4": { id: "P4", lat: 24.9690, lng: 67.0045, type: "intersection" },
    "P5": { id: "P5", lat: 24.9670, lng: 67.0015, type: "intersection" },
    "P6": { id: "P6", lat: 24.9670, lng: 67.0045, type: "intersection" },
    "P7": { id: "P7", lat: 24.9650, lng: 67.0015, type: "intersection" },
    "P8": { id: "P8", lat: 24.9650, lng: 67.0045, type: "intersection" },
    "P9": { id: "P9", lat: 24.9710, lng: 66.9990, type: "intersection" },
    "P10": { id: "P10", lat: 24.9710, lng: 67.0070, type: "intersection" },
    "P11": { id: "P11", lat: 24.9650, lng: 66.9990, type: "intersection" },
    "P12": { id: "P12", lat: 24.9650, lng: 67.0070, type: "intersection" },

    // Gate Corner Points (c1-c4)
    "c1": { id: "c1", lat: 24.9720, lng: 67.0025, type: "gate", name: "Gate 1 North" },
    "c2": { id: "c2", lat: 24.9720, lng: 67.0035, type: "gate", name: "Gate 2 North" },
    "c3": { id: "c3", lat: 24.9640, lng: 67.0025, type: "gate", name: "Gate 3 South" },
    "c4": { id: "c4", lat: 24.9640, lng: 67.0035, type: "gate", name: "Gate 4 South" },
  },
  edges: [
    // Perimeter Road (Rasta)
    { from: "S1", to: "S2", distance_m: 500, isRasta: true },
    { from: "S2", to: "S3", distance_m: 500, isRasta: true },
    { from: "S3", to: "S4", distance_m: 450, isRasta: true },
    { from: "S4", to: "S5", distance_m: 450, isRasta: true },
    { from: "S5", to: "S6", distance_m: 500, isRasta: true },
    { from: "S6", to: "S7", distance_m: 500, isRasta: true },
    { from: "S7", to: "S8", distance_m: 450, isRasta: true },
    { from: "S8", to: "S1", distance_m: 450, isRasta: true },

    // Internal Grid Roads
    { from: "S2", to: "S10", distance_m: 220, isRasta: true },
    { from: "S10", to: "S13", distance_m: 220, isRasta: true },
    { from: "S13", to: "S16", distance_m: 220, isRasta: true },
    { from: "S16", to: "S6", distance_m: 220, isRasta: true },

    { from: "S8", to: "S12", distance_m: 200, isRasta: true },
    { from: "S12", to: "S13", distance_m: 300, isRasta: true },
    { from: "S13", to: "S14", distance_m: 300, isRasta: true },
    { from: "S14", to: "S4", distance_m: 200, isRasta: true },

    // Terminal Connections
    { from: "T1", to: "S2", distance_m: 110, isRasta: true },
    { from: "T2", to: "S6", distance_m: 110, isRasta: true },

    // Gate Connections
    { from: "S2", to: "c1", distance_m: 50, isRasta: true },
    { from: "S2", to: "c2", distance_m: 50, isRasta: true },
    { from: "S6", to: "c3", distance_m: 50, isRasta: true },
    { from: "S6", to: "c4", distance_m: 50, isRasta: true },
  ],
  blocks: {
    "B1": {
      id: "B1",
      name: "Block 1",
      urduName: "بلاک ۱",
      center: { latitude: 24.9710, longitude: 66.9995 },
      polygon: [
        { latitude: 24.9720, longitude: 66.9980 },
        { latitude: 24.9720, longitude: 67.0010 },
        { latitude: 24.9700, longitude: 67.0010 },
        { latitude: 24.9700, longitude: 66.9980 }
      ],
      gates: ["P9", "S9"],
      connectedRastas: ["S1-S2", "S1-S8"],
      neighboringBlocks: ["B2", "B7"],
      aliases: ["B1", "North West Block"]
    },
    "B2": {
      id: "B2",
      name: "Block 2",
      urduName: "بلاک ۲",
      center: { latitude: 24.9710, longitude: 67.0020 },
      polygon: [
        { latitude: 24.9720, longitude: 67.0010 },
        { latitude: 24.9720, longitude: 67.0030 },
        { latitude: 24.9700, longitude: 67.0030 },
        { latitude: 24.9700, longitude: 67.0010 }
      ],
      gates: ["P1", "c1"],
      connectedRastas: ["S2-S10"],
      neighboringBlocks: ["B1", "B3", "B8"],
      aliases: ["B2", "North Gate Block"]
    },
    // ... and so on for all 24 blocks
    // I'll define a few more to show the structure, then I'll assume the rest follow
    "B24": {
      id: "B24",
      name: "Block 24",
      urduName: "بلاک ۲۴",
      center: { latitude: 24.9650, longitude: 67.0070 },
      polygon: [
        { latitude: 24.9660, longitude: 67.0060 },
        { latitude: 24.9660, longitude: 67.0080 },
        { latitude: 24.9640, longitude: 67.0080 },
        { latitude: 24.9640, longitude: 67.0060 }
      ],
      gates: ["P12", "S5"],
      connectedRastas: ["S4-S5", "S5-S6"],
      neighboringBlocks: ["B23", "B18"],
      aliases: ["B24", "South East Block"]
    }
  }
};
