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
    // --- Terminals ---
    "T2": { id: "T2", lat: 24.970806, lng: 66.999139, type: "road_end", name: "North Bus Terminal", urduName: "شمالی بس ٹرمینل" },
    "T1": { id: "T1", lat: 24.965639, lng: 66.999167, type: "road_end", name: "South Bus Terminal", urduName: "جنوبی بس ٹرمینل" },

    // --- North boundary road endpoints ---
    "S1":  { id: "S1",  lat: 24.970722, lng: 67.000694, type: "road_end", name: "North Rasta-01 End" },
    "S3":  { id: "S3",  lat: 24.970750, lng: 67.002667, type: "road_end", name: "North Rasta-03 End" },
    "S4":  { id: "S4",  lat: 24.970833, lng: 67.002667, type: "road_end", name: "North Rasta-04 End" },
    "S5":  { id: "S5",  lat: 24.970722, lng: 67.004861, type: "road_end", name: "North Rasta-05 End" },
    "S6":  { id: "S6",  lat: 24.970694, lng: 67.006361, type: "road_end", name: "North-East Corner" },

    // --- South boundary road endpoints ---
    "S2":  { id: "S2",  lat: 24.965639, lng: 67.000667, type: "road_end", name: "South Rasta-01 End" },
    "S8":  { id: "S8",  lat: 24.965639, lng: 67.001611, type: "road_end", name: "South Rasta-02 End" },
    "S9":  { id: "S9",  lat: 24.965667, lng: 67.002667, type: "road_end", name: "South Rasta-03 End" },
    "S10": { id: "S10", lat: 24.965667, lng: 67.003944, type: "road_end", name: "South Rasta-04 End" },
    "S11": { id: "S11", lat: 24.965667, lng: 67.004833, type: "road_end", name: "South Rasta-05 End" },
    "S12": { id: "S12", lat: 24.965639, lng: 67.006361, type: "road_end", name: "South-East Corner" },

    // --- West side nodes ---
    "S13": { id: "S13", lat: 24.969417, lng: 66.999222, type: "road_end", name: "West Rasta-09 End" },
    "S14": { id: "S14", lat: 24.967444, lng: 66.999194, type: "road_end", name: "West Rasta-11 End" },

    // --- East side nodes ---
    "S15": { id: "S15", lat: 24.967417, lng: 67.006333, type: "road_end", name: "East Rasta-11 End" },
    "S16": { id: "S16", lat: 24.969389, lng: 67.006361, type: "road_end", name: "East Rasta-09 End" },
    "S17": { id: "S17", lat: 24.968389, lng: 67.006361, type: "road_end", name: "East Mid-Rasta End" },

    // --- Intersections: Rasta-09 row (E-W at lat ≈ 24.9694) ---
    "P1":  { id: "P1",  lat: 24.969389, lng: 67.000694, type: "intersection" },
    "P2":  { id: "P2",  lat: 24.969389, lng: 67.001639, type: "intersection" },
    "P3":  { id: "P3",  lat: 24.969389, lng: 67.002722, type: "intersection" },
    "P4":  { id: "P4",  lat: 24.969417, lng: 67.003944, type: "intersection" },
    "P5":  { id: "P5",  lat: 24.969389, lng: 67.004861, type: "intersection" },

    // --- Intersections: middle row (lat ≈ 24.9684) ---
    "P6":  { id: "P6",  lat: 24.968417, lng: 67.001611, type: "intersection" },
    "P7":  { id: "P7",  lat: 24.968417, lng: 67.004861, type: "intersection" },

    // --- Intersections: Rasta-11 row (E-W at lat ≈ 24.9674) ---
    "P8":  { id: "P8",  lat: 24.967417, lng: 67.000667, type: "intersection" },
    "P9":  { id: "P9",  lat: 24.967417, lng: 67.001611, type: "intersection" },
    "P10": { id: "P10", lat: 24.967417, lng: 67.002694, type: "intersection" },
    "P11": { id: "P11", lat: 24.967417, lng: 67.003917, type: "intersection" },
    "P12": { id: "P12", lat: 24.967417, lng: 67.004861, type: "intersection" },
  },

  edges: [
    // === West boundary (terminal road) ===
    { from: "T2",  to: "S13", distance_m: 155, isRasta: true, name: "West Terminal Road" },
    { from: "S13", to: "S14", distance_m: 219, isRasta: true, name: "West Terminal Road" },
    { from: "S14", to: "T1",  distance_m: 201, isRasta: true, name: "West Terminal Road" },

    // === North boundary road (T2 → S1 → S3 → S4 → S5 → S6) ===
    { from: "T2", to: "S1",  distance_m: 157, isRasta: true, name: "North Boundary Road" },
    { from: "S1", to: "S3",  distance_m: 199, isRasta: true, name: "North Boundary Road" },
    { from: "S3", to: "S4",  distance_m: 9,   isRasta: true, name: "North Boundary Road" },
    { from: "S4", to: "S5",  distance_m: 222, isRasta: true, name: "North Boundary Road" },
    { from: "S5", to: "S6",  distance_m: 151, isRasta: true, name: "North Boundary Road" },

    // === South boundary road (T1 → S2 → S8 → S9 → S10 → S11 → S12) ===
    { from: "T1",  to: "S2",  distance_m: 151, isRasta: true, name: "South Boundary Road" },
    { from: "S2",  to: "S8",  distance_m: 95,  isRasta: true, name: "South Boundary Road" },
    { from: "S8",  to: "S9",  distance_m: 106, isRasta: true, name: "South Boundary Road" },
    { from: "S9",  to: "S10", distance_m: 129, isRasta: true, name: "South Boundary Road" },
    { from: "S10", to: "S11", distance_m: 90,  isRasta: true, name: "South Boundary Road" },
    { from: "S11", to: "S12", distance_m: 154, isRasta: true, name: "South Boundary Road" },

    // === East boundary road (S6 → S16 → S17 → S15 → S12) ===
    { from: "S6",  to: "S16", distance_m: 145, isRasta: true, name: "East Boundary Road" },
    { from: "S16", to: "S17", distance_m: 111, isRasta: true, name: "East Boundary Road" },
    { from: "S17", to: "S15", distance_m: 108, isRasta: true, name: "East Boundary Road" },
    { from: "S15", to: "S12", distance_m: 198, isRasta: true, name: "East Boundary Road" },

    // === Rasta-01 N-S (S1 → P1 → P8 → S2) ===
    { from: "S1", to: "P1", distance_m: 148, isRasta: true, name: "Rasta 01" },
    { from: "P1", to: "P8", distance_m: 219, isRasta: true, name: "Rasta 01" },
    { from: "P8", to: "S2", distance_m: 198, isRasta: true, name: "Rasta 01" },

    // === Rasta-02 partial N-S (P2 → P6 → P9 → S8) ===
    { from: "P2", to: "P6", distance_m: 108, isRasta: true, name: "Rasta 02" },
    { from: "P6", to: "P9", distance_m: 111, isRasta: true, name: "Rasta 02" },
    { from: "P9", to: "S8", distance_m: 198, isRasta: true, name: "Rasta 02" },

    // === Rasta-03 N-S (S3 → P3 → P10 → S9) ===
    { from: "S3",  to: "P3",  distance_m: 151, isRasta: true, name: "Rasta 03" },
    { from: "P3",  to: "P10", distance_m: 219, isRasta: true, name: "Rasta 03" },
    { from: "P10", to: "S9",  distance_m: 195, isRasta: true, name: "Rasta 03" },

    // === Rasta-04 N-S (S4 → P4 → P11 → S10) ===
    { from: "S4",  to: "P4",  distance_m: 203, isRasta: true, name: "Rasta 04" },
    { from: "P4",  to: "P11", distance_m: 222, isRasta: true, name: "Rasta 04" },
    { from: "P11", to: "S10", distance_m: 195, isRasta: true, name: "Rasta 04" },

    // === Rasta-05 N-S (S5 → P5 → P7 → P12 → S11) ===
    { from: "S5",  to: "P5",  distance_m: 148, isRasta: true, name: "Rasta 05" },
    { from: "P5",  to: "P7",  distance_m: 108, isRasta: true, name: "Rasta 05" },
    { from: "P7",  to: "P12", distance_m: 111, isRasta: true, name: "Rasta 05" },
    { from: "P12", to: "S11", distance_m: 195, isRasta: true, name: "Rasta 05" },

    // === Rasta-09 E-W (S13 → P1 → P2 → P3 → P4 → P5 → S16) ===
    { from: "S13", to: "P1", distance_m: 148, isRasta: true, name: "Rasta 09" },
    { from: "P1",  to: "P2", distance_m: 95,  isRasta: true, name: "Rasta 09" },
    { from: "P2",  to: "P3", distance_m: 109, isRasta: true, name: "Rasta 09" },
    { from: "P3",  to: "P4", distance_m: 123, isRasta: true, name: "Rasta 09" },
    { from: "P4",  to: "P5", distance_m: 92,  isRasta: true, name: "Rasta 09" },
    { from: "P5",  to: "S16", distance_m: 151, isRasta: true, name: "Rasta 09" },

    // === Middle E-W connector (P6 → P7) ===
    { from: "P6", to: "P7", distance_m: 328, isRasta: true, name: "Middle Road" },

    // === Rasta-11 E-W (S14 → P8 → P9 → P10 → P11 → P12 → S15) ===
    { from: "S14", to: "P8",  distance_m: 149, isRasta: true, name: "Rasta 11" },
    { from: "P8",  to: "P9",  distance_m: 95,  isRasta: true, name: "Rasta 11" },
    { from: "P9",  to: "P10", distance_m: 109, isRasta: true, name: "Rasta 11" },
    { from: "P10", to: "P11", distance_m: 123, isRasta: true, name: "Rasta 11" },
    { from: "P11", to: "P12", distance_m: 95,  isRasta: true, name: "Rasta 11" },
    { from: "P12", to: "S15", distance_m: 148, isRasta: true, name: "Rasta 11" },
  ],

  blocks: {
    // ========================================================
    // ROW A — North of Rasta-09 (lat > 24.9694)
    // ========================================================
    "B1": {
      id: "B1", name: "Block 1", urduName: "بلاک ۱",
      center: { latitude: 24.970083, longitude: 67.000056 },
      corners: [
        { latitude: 24.970583, longitude: 66.999500 },
        { latitude: 24.970583, longitude: 67.000611 },
        { latitude: 24.969528, longitude: 67.000611 },
        { latitude: 24.969528, longitude: 66.999444 },
      ],
      polygon: [
        { latitude: 24.970583, longitude: 66.999500 },
        { latitude: 24.970583, longitude: 67.000611 },
        { latitude: 24.969528, longitude: 67.000611 },
        { latitude: 24.969528, longitude: 66.999444 },
      ],
      gates: ["T2", "S13", "P1"],
      entry_nodes: ["T2", "S13", "S1", "P1"],
      connectedRastas: ["West Terminal Road", "North Boundary Road", "Rasta 01", "Rasta 09"],
      neighboringBlocks: ["B2", "B4"],
      aliases: ["B1", "Block 1", "بلاک ۱"],
    },
    "B4": {
      id: "B4", name: "Block 4", urduName: "بلاک ۴",
      center: { latitude: 24.970083, longitude: 67.001167 },
      corners: [
        { latitude: 24.970667, longitude: 67.000778 },
        { latitude: 24.970639, longitude: 67.001583 },
        { latitude: 24.969472, longitude: 67.001556 },
        { latitude: 24.969472, longitude: 67.000778 },
      ],
      polygon: [
        { latitude: 24.970667, longitude: 67.000778 },
        { latitude: 24.970639, longitude: 67.001583 },
        { latitude: 24.969472, longitude: 67.001556 },
        { latitude: 24.969472, longitude: 67.000778 },
      ],
      gates: ["P1", "P2"],
      entry_nodes: ["P1", "P2"],
      connectedRastas: ["Rasta 01", "Rasta 09", "Rasta 02"],
      neighboringBlocks: ["B1", "B5", "B8"],
      aliases: ["B4", "Block 4", "بلاک ۴"],
    },
    "B8": {
      id: "B8", name: "Block 8", urduName: "بلاک ۸",
      center: { latitude: 24.970167, longitude: 67.002167 },
      corners: [
        { latitude: 24.970639, longitude: 67.001694 },
        { latitude: 24.970639, longitude: 67.002611 },
        { latitude: 24.969472, longitude: 67.002611 },
        { latitude: 24.969472, longitude: 67.001694 },
      ],
      polygon: [
        { latitude: 24.970639, longitude: 67.001694 },
        { latitude: 24.970639, longitude: 67.002611 },
        { latitude: 24.969472, longitude: 67.002611 },
        { latitude: 24.969472, longitude: 67.001694 },
      ],
      gates: ["P2", "P3"],
      entry_nodes: ["P2", "P3"],
      connectedRastas: ["Rasta 02", "Rasta 09", "Rasta 03"],
      neighboringBlocks: ["B4", "B9", "B12"],
      aliases: ["B8", "Block 8", "بلاک ۸"],
    },
    "B12": {
      id: "B12", name: "Block 12", urduName: "بلاک ۱۲",
      center: { latitude: 24.969972, longitude: 67.003333 },
      corners: [
        { latitude: 24.970639, longitude: 67.002806 },
        { latitude: 24.970472, longitude: 67.003861 },
        { latitude: 24.969528, longitude: 67.003833 },
        { latitude: 24.969500, longitude: 67.002806 },
      ],
      polygon: [
        { latitude: 24.970639, longitude: 67.002806 },
        { latitude: 24.970472, longitude: 67.003861 },
        { latitude: 24.969528, longitude: 67.003833 },
        { latitude: 24.969500, longitude: 67.002806 },
      ],
      gates: ["P3", "P4"],
      entry_nodes: ["P3", "P4"],
      connectedRastas: ["Rasta 03", "Rasta 09", "Rasta 04"],
      neighboringBlocks: ["B8", "B13", "B17"],
      aliases: ["B12", "Block 12", "بلاک ۱۲"],
    },
    "B17": {
      id: "B17", name: "Block 17", urduName: "بلاک ۱۷",
      center: { latitude: 24.969972, longitude: 67.004417 },
      corners: [
        { latitude: 24.970472, longitude: 67.004028 },
        { latitude: 24.970417, longitude: 67.004750 },
        { latitude: 24.969500, longitude: 67.004778 },
        { latitude: 24.969500, longitude: 67.004028 },
      ],
      polygon: [
        { latitude: 24.970472, longitude: 67.004028 },
        { latitude: 24.970417, longitude: 67.004750 },
        { latitude: 24.969500, longitude: 67.004778 },
        { latitude: 24.969500, longitude: 67.004028 },
      ],
      gates: ["P4", "P5"],
      entry_nodes: ["P4", "P5"],
      connectedRastas: ["Rasta 04", "Rasta 09", "Rasta 05"],
      neighboringBlocks: ["B12", "B18", "B21"],
      aliases: ["B17", "Block 17", "بلاک ۱۷"],
    },
    "B21": {
      id: "B21", name: "Block 21", urduName: "بلاک ۲۱",
      center: { latitude: 24.970000, longitude: 67.005639 },
      corners: [
        { latitude: 24.970472, longitude: 67.004944 },
        { latitude: 24.970472, longitude: 67.006306 },
        { latitude: 24.969500, longitude: 67.006306 },
        { latitude: 24.969500, longitude: 67.004972 },
      ],
      polygon: [
        { latitude: 24.970472, longitude: 67.004944 },
        { latitude: 24.970472, longitude: 67.006306 },
        { latitude: 24.969500, longitude: 67.006306 },
        { latitude: 24.969500, longitude: 67.004972 },
      ],
      gates: ["P5", "S16"],
      entry_nodes: ["P5", "S5", "S6", "S16"],
      connectedRastas: ["Rasta 05", "Rasta 09", "North Boundary Road", "East Boundary Road"],
      neighboringBlocks: ["B17", "B22"],
      aliases: ["B21", "Block 21", "بلاک ۲۱"],
    },

    // ========================================================
    // ROW B — Between Rasta-09 and middle road (lat 24.9684-24.9694)
    // ========================================================
    "B2": {
      id: "B2", name: "Block 2", urduName: "بلاک ۲",
      center: { latitude: 24.968500, longitude: 66.999917 },
      corners: [
        { latitude: 24.969306, longitude: 66.999389 },
        { latitude: 24.969306, longitude: 67.000556 },
        { latitude: 24.967583, longitude: 67.000528 },
        { latitude: 24.967583, longitude: 66.999333 },
      ],
      polygon: [
        { latitude: 24.969306, longitude: 66.999389 },
        { latitude: 24.969306, longitude: 67.000556 },
        { latitude: 24.967583, longitude: 67.000528 },
        { latitude: 24.967583, longitude: 66.999333 },
      ],
      gates: ["S13", "P1", "P8", "S14"],
      entry_nodes: ["S13", "P1", "P8", "S14"],
      connectedRastas: ["West Terminal Road", "Rasta 01", "Rasta 09", "Rasta 11"],
      neighboringBlocks: ["B1", "B3", "B5", "B6"],
      aliases: ["B2", "Block 2", "بلاک ۲"],
    },
    "B5": {
      id: "B5", name: "Block 5", urduName: "بلاک ۵",
      center: { latitude: 24.968917, longitude: 67.001167 },
      corners: [
        { latitude: 24.969333, longitude: 67.000778 },
        { latitude: 24.969333, longitude: 67.001556 },
        { latitude: 24.968472, longitude: 67.001556 },
        { latitude: 24.968472, longitude: 67.000778 },
      ],
      polygon: [
        { latitude: 24.969333, longitude: 67.000778 },
        { latitude: 24.969333, longitude: 67.001556 },
        { latitude: 24.968472, longitude: 67.001556 },
        { latitude: 24.968472, longitude: 67.000778 },
      ],
      gates: ["P1", "P2", "P6"],
      entry_nodes: ["P1", "P2", "P6"],
      connectedRastas: ["Rasta 01", "Rasta 09", "Rasta 02"],
      neighboringBlocks: ["B2", "B4", "B6", "B9"],
      aliases: ["B5", "Block 5", "بلاک ۵"],
    },
    "B9": {
      id: "B9", name: "Block 9", urduName: "بلاک ۹",
      center: { latitude: 24.968944, longitude: 67.002139 },
      corners: [
        { latitude: 24.969333, longitude: 67.001694 },
        { latitude: 24.969333, longitude: 67.002611 },
        { latitude: 24.968472, longitude: 67.002528 },
        { latitude: 24.968472, longitude: 67.001694 },
      ],
      polygon: [
        { latitude: 24.969333, longitude: 67.001694 },
        { latitude: 24.969333, longitude: 67.002611 },
        { latitude: 24.968472, longitude: 67.002528 },
        { latitude: 24.968472, longitude: 67.001694 },
      ],
      gates: ["P2", "P3", "P6"],
      entry_nodes: ["P2", "P3", "P6"],
      connectedRastas: ["Rasta 02", "Rasta 09", "Rasta 03", "Middle Road"],
      neighboringBlocks: ["B5", "B8", "B10", "B13"],
      aliases: ["B9", "Block 9", "بلاک ۹"],
    },
    "B13": {
      id: "B13", name: "Block 13", urduName: "بلاک ۱۳",
      center: { latitude: 24.968806, longitude: 67.003278 },
      corners: [
        { latitude: 24.969333, longitude: 67.002806 },
        { latitude: 24.969306, longitude: 67.003833 },
        { latitude: 24.968500, longitude: 67.003833 },
        { latitude: 24.968500, longitude: 67.002750 },
      ],
      polygon: [
        { latitude: 24.969333, longitude: 67.002806 },
        { latitude: 24.969306, longitude: 67.003833 },
        { latitude: 24.968500, longitude: 67.003833 },
        { latitude: 24.968500, longitude: 67.002750 },
      ],
      gates: ["P3", "P4"],
      entry_nodes: ["P3", "P4", "P6", "P7"],
      connectedRastas: ["Rasta 03", "Rasta 09", "Rasta 04", "Middle Road"],
      neighboringBlocks: ["B9", "B12", "B14", "B18"],
      aliases: ["B13", "Block 13", "بلاک ۱۳"],
    },
    "B18": {
      id: "B18", name: "Block 18", urduName: "بلاک ۱۸",
      center: { latitude: 24.968944, longitude: 67.004417 },
      corners: [
        { latitude: 24.969306, longitude: 67.004028 },
        { latitude: 24.969306, longitude: 67.004778 },
        { latitude: 24.968500, longitude: 67.004750 },
        { latitude: 24.968528, longitude: 67.004028 },
      ],
      polygon: [
        { latitude: 24.969306, longitude: 67.004028 },
        { latitude: 24.969306, longitude: 67.004778 },
        { latitude: 24.968500, longitude: 67.004750 },
        { latitude: 24.968528, longitude: 67.004028 },
      ],
      gates: ["P4", "P5", "P7"],
      entry_nodes: ["P4", "P5", "P7"],
      connectedRastas: ["Rasta 04", "Rasta 09", "Rasta 05", "Middle Road"],
      neighboringBlocks: ["B13", "B17", "B19", "B22"],
      aliases: ["B18", "Block 18", "بلاک ۱۸"],
    },
    "B22": {
      id: "B22", name: "Block 22", urduName: "بلاک ۲۲",
      center: { latitude: 24.968944, longitude: 67.005611 },
      corners: [
        { latitude: 24.969333, longitude: 67.004972 },
        { latitude: 24.969333, longitude: 67.006278 },
        { latitude: 24.968500, longitude: 67.006278 },
        { latitude: 24.968500, longitude: 67.004972 },
      ],
      polygon: [
        { latitude: 24.969333, longitude: 67.004972 },
        { latitude: 24.969333, longitude: 67.006278 },
        { latitude: 24.968500, longitude: 67.006278 },
        { latitude: 24.968500, longitude: 67.004972 },
      ],
      gates: ["P5", "S16", "P7", "S17"],
      entry_nodes: ["P5", "S16", "P7", "S17"],
      connectedRastas: ["Rasta 05", "Rasta 09", "East Boundary Road", "Middle Road"],
      neighboringBlocks: ["B18", "B21", "B23"],
      aliases: ["B22", "Block 22", "بلاک ۲۲"],
    },

    // ========================================================
    // ROW C — Between middle road and Rasta-11 (lat 24.9674-24.9684)
    // ========================================================
    "B6": {
      id: "B6", name: "Block 6", urduName: "بلاک ۶",
      center: { latitude: 24.967917, longitude: 67.001167 },
      corners: [
        { latitude: 24.968361, longitude: 67.000750 },
        { latitude: 24.968333, longitude: 67.001556 },
        { latitude: 24.967500, longitude: 67.001528 },
        { latitude: 24.967500, longitude: 67.000750 },
      ],
      polygon: [
        { latitude: 24.968361, longitude: 67.000750 },
        { latitude: 24.968333, longitude: 67.001556 },
        { latitude: 24.967500, longitude: 67.001528 },
        { latitude: 24.967500, longitude: 67.000750 },
      ],
      gates: ["P6", "P8", "P9"],
      entry_nodes: ["P6", "P8", "P9"],
      connectedRastas: ["Rasta 01", "Rasta 02", "Rasta 11", "Middle Road"],
      neighboringBlocks: ["B2", "B5", "B7", "B10"],
      aliases: ["B6", "Block 6", "بلاک ۶"],
    },
    "B10": {
      id: "B10", name: "Block 10", urduName: "بلاک ۱۰",
      center: { latitude: 24.967917, longitude: 67.002111 },
      corners: [
        { latitude: 24.968333, longitude: 67.001694 },
        { latitude: 24.968333, longitude: 67.002639 },
        { latitude: 24.967500, longitude: 67.002583 },
        { latitude: 24.967500, longitude: 67.001694 },
      ],
      polygon: [
        { latitude: 24.968333, longitude: 67.001694 },
        { latitude: 24.968333, longitude: 67.002639 },
        { latitude: 24.967500, longitude: 67.002583 },
        { latitude: 24.967500, longitude: 67.001694 },
      ],
      gates: ["P6", "P9", "P10"],
      entry_nodes: ["P6", "P9", "P10"],
      connectedRastas: ["Rasta 02", "Rasta 03", "Rasta 11", "Middle Road"],
      neighboringBlocks: ["B6", "B9", "B11", "B14"],
      aliases: ["B10", "Block 10", "بلاک ۱۰"],
    },
    "B14": {
      id: "B14", name: "Block 14", urduName: "بلاک ۱۴",
      center: { latitude: 24.967944, longitude: 67.003306 },
      corners: [
        { latitude: 24.968361, longitude: 67.002778 },
        { latitude: 24.968361, longitude: 67.003833 },
        { latitude: 24.967528, longitude: 67.003833 },
        { latitude: 24.967500, longitude: 67.002778 },
      ],
      polygon: [
        { latitude: 24.968361, longitude: 67.002778 },
        { latitude: 24.968361, longitude: 67.003833 },
        { latitude: 24.967528, longitude: 67.003833 },
        { latitude: 24.967500, longitude: 67.002778 },
      ],
      gates: ["P10", "P11"],
      entry_nodes: ["P7", "P10", "P11"],
      connectedRastas: ["Rasta 03", "Rasta 04", "Rasta 11", "Middle Road"],
      neighboringBlocks: ["B10", "B13", "B15", "B19"],
      aliases: ["B14", "Block 14", "بلاک ۱۴"],
    },
    "B19": {
      id: "B19", name: "Block 19", urduName: "بلاک ۱۹",
      center: { latitude: 24.967944, longitude: 67.004389 },
      corners: [
        { latitude: 24.968333, longitude: 67.004000 },
        { latitude: 24.968306, longitude: 67.004750 },
        { latitude: 24.967528, longitude: 67.004750 },
        { latitude: 24.967528, longitude: 67.004028 },
      ],
      polygon: [
        { latitude: 24.968333, longitude: 67.004000 },
        { latitude: 24.968306, longitude: 67.004750 },
        { latitude: 24.967528, longitude: 67.004750 },
        { latitude: 24.967528, longitude: 67.004028 },
      ],
      gates: ["P7", "P11", "P12"],
      entry_nodes: ["P7", "P11", "P12"],
      connectedRastas: ["Rasta 04", "Rasta 05", "Rasta 11", "Middle Road"],
      neighboringBlocks: ["B14", "B18", "B20", "B23"],
      aliases: ["B19", "Block 19", "بلاک ۱۹"],
    },
    "B23": {
      id: "B23", name: "Block 23", urduName: "بلاک ۲۳",
      center: { latitude: 24.967944, longitude: 67.005639 },
      corners: [
        { latitude: 24.968333, longitude: 67.004972 },
        { latitude: 24.968306, longitude: 67.006250 },
        { latitude: 24.967500, longitude: 67.006250 },
        { latitude: 24.967528, longitude: 67.004944 },
      ],
      polygon: [
        { latitude: 24.968333, longitude: 67.004972 },
        { latitude: 24.968306, longitude: 67.006250 },
        { latitude: 24.967500, longitude: 67.006250 },
        { latitude: 24.967528, longitude: 67.004944 },
      ],
      gates: ["P7", "S17", "P12", "S15"],
      entry_nodes: ["P7", "S17", "P12", "S15"],
      connectedRastas: ["Rasta 05", "Rasta 11", "East Boundary Road", "Middle Road"],
      neighboringBlocks: ["B19", "B22", "B24"],
      aliases: ["B23", "Block 23", "بلاک ۲۳"],
    },

    // ========================================================
    // ROW D — South of Rasta-11 (lat < 24.9674)
    // ========================================================
    "B3": {
      id: "B3", name: "Block 3", urduName: "بلاک ۳",
      center: { latitude: 24.966583, longitude: 67.000028 },
      corners: [
        { latitude: 24.967333, longitude: 66.999417 },
        { latitude: 24.967333, longitude: 67.000583 },
        { latitude: 24.965722, longitude: 67.000583 },
        { latitude: 24.965750, longitude: 66.999417 },
      ],
      polygon: [
        { latitude: 24.967333, longitude: 66.999417 },
        { latitude: 24.967333, longitude: 67.000583 },
        { latitude: 24.965722, longitude: 67.000583 },
        { latitude: 24.965750, longitude: 66.999417 },
      ],
      gates: ["P8", "S14", "T1", "S2"],
      entry_nodes: ["P8", "S14", "T1", "S2"],
      connectedRastas: ["West Terminal Road", "Rasta 01", "Rasta 11", "South Boundary Road"],
      neighboringBlocks: ["B2", "B7"],
      aliases: ["B3", "Block 3", "بلاک ۳"],
    },
    "B7": {
      id: "B7", name: "Block 7", urduName: "بلاک ۷",
      center: { latitude: 24.966528, longitude: 67.001139 },
      corners: [
        { latitude: 24.967333, longitude: 67.000750 },
        { latitude: 24.967333, longitude: 67.001556 },
        { latitude: 24.965694, longitude: 67.001528 },
        { latitude: 24.965722, longitude: 67.000750 },
      ],
      polygon: [
        { latitude: 24.967333, longitude: 67.000750 },
        { latitude: 24.967333, longitude: 67.001556 },
        { latitude: 24.965694, longitude: 67.001528 },
        { latitude: 24.965722, longitude: 67.000750 },
      ],
      gates: ["P8", "P9", "S2", "S8"],
      entry_nodes: ["P8", "P9", "S2", "S8"],
      connectedRastas: ["Rasta 01", "Rasta 02", "Rasta 11", "South Boundary Road"],
      neighboringBlocks: ["B3", "B6", "B11"],
      aliases: ["B7", "Block 7", "بلاک ۷"],
    },
    "B11": {
      id: "B11", name: "Block 11", urduName: "بلاک ۱۱",
      center: { latitude: 24.966583, longitude: 67.002139 },
      corners: [
        { latitude: 24.967333, longitude: 67.001694 },
        { latitude: 24.967333, longitude: 67.002611 },
        { latitude: 24.965722, longitude: 67.002611 },
        { latitude: 24.965722, longitude: 67.001667 },
      ],
      polygon: [
        { latitude: 24.967333, longitude: 67.001694 },
        { latitude: 24.967333, longitude: 67.002611 },
        { latitude: 24.965722, longitude: 67.002611 },
        { latitude: 24.965722, longitude: 67.001667 },
      ],
      gates: ["P9", "P10", "S8", "S9"],
      entry_nodes: ["P9", "P10", "S8", "S9"],
      connectedRastas: ["Rasta 02", "Rasta 03", "Rasta 11", "South Boundary Road"],
      neighboringBlocks: ["B7", "B10", "B15", "B16"],
      aliases: ["B11", "Block 11", "بلاک ۱۱"],
    },
    "B15": {
      id: "B15", name: "Block 15", urduName: "بلاک ۱۵",
      center: { latitude: 24.966889, longitude: 67.003306 },
      corners: [
        { latitude: 24.967361, longitude: 67.002778 },
        { latitude: 24.967333, longitude: 67.003861 },
        { latitude: 24.966417, longitude: 67.003806 },
        { latitude: 24.966389, longitude: 67.002778 },
      ],
      polygon: [
        { latitude: 24.967361, longitude: 67.002778 },
        { latitude: 24.967333, longitude: 67.003861 },
        { latitude: 24.966417, longitude: 67.003806 },
        { latitude: 24.966389, longitude: 67.002778 },
      ],
      gates: ["P10", "P11", "S9"],
      entry_nodes: ["P10", "P11", "S9", "S10"],
      connectedRastas: ["Rasta 03", "Rasta 04", "Rasta 11", "South Boundary Road"],
      neighboringBlocks: ["B11", "B14", "B16", "B20"],
      aliases: ["B15", "Block 15", "بلاک ۱۵"],
    },
    "B16": {
      id: "B16", name: "Block 16", urduName: "بلاک ۱۶",
      center: { latitude: 24.965972, longitude: 67.002972 },
      corners: [
        { latitude: 24.966361, longitude: 67.002750 },
        { latitude: 24.966361, longitude: 67.003389 },
        { latitude: 24.965722, longitude: 67.003333 },
        { latitude: 24.965722, longitude: 67.002750 },
      ],
      polygon: [
        { latitude: 24.966361, longitude: 67.002750 },
        { latitude: 24.966361, longitude: 67.003389 },
        { latitude: 24.965722, longitude: 67.003333 },
        { latitude: 24.965722, longitude: 67.002750 },
      ],
      gates: ["S9", "S10"],
      entry_nodes: ["S9", "S10"],
      connectedRastas: ["South Boundary Road", "Rasta 03", "Rasta 04"],
      neighboringBlocks: ["B11", "B15"],
      aliases: ["B16", "Block 16", "بلاک ۱۶"],
    },
    "B20": {
      id: "B20", name: "Block 20", urduName: "بلاک ۲۰",
      center: { latitude: 24.966861, longitude: 67.004389 },
      corners: [
        { latitude: 24.967361, longitude: 67.003972 },
        { latitude: 24.967333, longitude: 67.004750 },
        { latitude: 24.966389, longitude: 67.004750 },
        { latitude: 24.966389, longitude: 67.004000 },
      ],
      polygon: [
        { latitude: 24.967361, longitude: 67.003972 },
        { latitude: 24.967333, longitude: 67.004750 },
        { latitude: 24.966389, longitude: 67.004750 },
        { latitude: 24.966389, longitude: 67.004000 },
      ],
      gates: ["P11", "P12", "S10", "S11"],
      entry_nodes: ["P11", "P12", "S10", "S11"],
      connectedRastas: ["Rasta 04", "Rasta 05", "Rasta 11", "South Boundary Road"],
      neighboringBlocks: ["B15", "B19", "B24"],
      aliases: ["B20", "Block 20", "بلاک ۲۰"],
    },
    "B24": {
      id: "B24", name: "Block 24", urduName: "بلاک ۲۴",
      center: { latitude: 24.966861, longitude: 67.005611 },
      corners: [
        { latitude: 24.967333, longitude: 67.004972 },
        { latitude: 24.967333, longitude: 67.006278 },
        { latitude: 24.966361, longitude: 67.006250 },
        { latitude: 24.966361, longitude: 67.004972 },
      ],
      polygon: [
        { latitude: 24.967333, longitude: 67.004972 },
        { latitude: 24.967333, longitude: 67.006278 },
        { latitude: 24.966361, longitude: 67.006250 },
        { latitude: 24.966361, longitude: 67.004972 },
      ],
      gates: ["P12", "S15", "S11", "S12"],
      entry_nodes: ["P12", "S15", "S11", "S12"],
      connectedRastas: ["Rasta 05", "Rasta 11", "East Boundary Road", "South Boundary Road"],
      neighboringBlocks: ["B20", "B23"],
      aliases: ["B24", "Block 24", "بلاک ۲۴"],
    },
  }
};
