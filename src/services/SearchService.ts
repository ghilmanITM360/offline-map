/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { IJTEMA_DATA } from '../constants/data';
import { Place } from '../models/types';
import { FuzzySearchService } from './FuzzySearchService';

// Urdu digit → ASCII digit map for Urdu number search
const URDU_DIGITS: Record<string, string> = {
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
  '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
};

function normalizeUrdu(text: string): string {
  return text.replace(/[۰-۹]/g, (ch) => URDU_DIGITS[ch] ?? ch);
}

function blockNumber(blockId: string): string {
  return blockId.replace(/^B/, '');
}

export class SearchService {
  static search(query: string): Place[] {
    if (!query || query.trim().length === 0) return [];

    const raw = query.trim();
    // Normalise Urdu numerals before matching
    const normalised = normalizeUrdu(raw).toLowerCase();

    const results: Place[] = [];

    // ─── Blocks ────────────────────────────────────────────────────────────
    Object.entries(IJTEMA_DATA.blocks).forEach(([id, block]) => {
      const num = blockNumber(id);                        // "13"
      const friendlyName = block.name;                    // "Block 13"
      const urduName = block.urduName ?? '';

      const matchesName    = FuzzySearchService.matches(normalised, friendlyName.toLowerCase());
      const matchesNumber  = normalised === num || normalised === `b${num}`;
      const matchesUrdu    = urduName.includes(raw) || normalizeUrdu(urduName).toLowerCase().includes(normalised);
      const matchesAlias   = block.aliases.some((a) => FuzzySearchService.matches(normalised, a.toLowerCase()));
      // Tolerate typos like "blok" → "block"
      const matchesFuzzy   = FuzzySearchService.matches(normalised, `block ${num}`);

      if (matchesName || matchesNumber || matchesUrdu || matchesAlias || matchesFuzzy) {
        results.push(this.blockToPlace(id, block));
      }
    });

    // ─── Named nodes (gates, masjids) — only those with a human name ──────
    Object.entries(IJTEMA_DATA.nodes).forEach(([id, node]) => {
      // Skip internal intersection/road-end nodes that have no meaningful name
      if (!node.name) return;
      // Never surface raw IDs like P10, S12
      if (/^(P|S)\d+$/.test(id)) return;

      const matchesName  = FuzzySearchService.matches(normalised, node.name.toLowerCase());
      const matchesUrdu  = node.urduName ? node.urduName.includes(raw) : false;
      if (matchesName || matchesUrdu) {
        results.push(this.nodeToPlace(id, node));
      }
    });

    // ─── Keyword shortcuts ─────────────────────────────────────────────────
    const keywords: Record<string, string[]> = {
      masjid: ['masjid', 'مسجد', 'mosque', 'prayer'],
      food:   ['food', 'کھانا', 'water', 'پانی', 'langar', 'لنگر'],
    };
    for (const [cat, terms] of Object.entries(keywords)) {
      if (terms.some((t) => normalised.includes(t))) {
        const catResults = this.searchByCategory(cat);
        catResults.forEach((p) => {
          if (!results.find((r) => r.id === p.id)) results.push(p);
        });
      }
    }

    return results;
  }

  static searchByCategory(category: string): Place[] {
    const cat = category.toLowerCase();
    const results: Place[] = [];

    if (cat === 'blocks') {
      Object.entries(IJTEMA_DATA.blocks).forEach(([id, block]) => {
        results.push(this.blockToPlace(id, block));
      });
    } else if (cat === 'gates') {
      Object.entries(IJTEMA_DATA.nodes).forEach(([id, node]) => {
        if (node.type === 'gate') results.push(this.nodeToPlace(id, node));
      });
    } else if (cat === 'masjid') {
      Object.entries(IJTEMA_DATA.nodes).forEach(([id, node]) => {
        if (node.type === 'masjid') results.push(this.nodeToPlace(id, node));
      });
    } else if (cat === 'rastas') {
      // Surface named rastas — not raw internal S/P nodes
      const seen = new Set<string>();
      IJTEMA_DATA.edges.forEach((edge) => {
        if (!edge.name || seen.has(edge.name) || !edge.isRasta) return;
        seen.add(edge.name);
        const fromNode = (IJTEMA_DATA.nodes as any)[edge.from];
        if (!fromNode) return;
        results.push({
          id: edge.name,
          name: edge.name,
          category: 'Rasta',
          description: `Walking path: ${edge.name}`,
          coordinate: { latitude: fromNode.lat, longitude: fromNode.lng },
        });
      });
    }

    return results;
  }

  static getPlaceById(id: string): Place | null {
    const block = (IJTEMA_DATA.blocks as any)[id];
    if (block) return this.blockToPlace(id, block);

    const node = (IJTEMA_DATA.nodes as any)[id];
    if (node) return this.nodeToPlace(id, node);

    return null;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private static blockToPlace(id: string, block: any): Place {
    const num = blockNumber(id);
    return {
      id,
      name: `Block ${num}`,
      urduName: block.urduName,
      category: 'Block',
      description: `Block ${num} — part of Karachi Ijtema ground.`,
      coordinate: block.center,
      aliases: block.aliases,
    };
  }

  private static nodeToPlace(id: string, node: any): Place {
    let category: Place['category'] = 'Landmark';
    let description = node.name ?? id;

    if (node.type === 'gate') {
      category = 'Gate';
      description = `Entry / exit gate — ${node.name ?? id}`;
    } else if (node.type === 'masjid') {
      category = 'Masjid';
      description = `Prayer area — ${node.name ?? id}`;
    } else if (node.type === 'road_end') {
      category = 'Rasta';
      description = node.name ?? id;
    }

    return {
      id,
      name: node.name ?? id,
      urduName: node.urduName,
      category,
      description,
      coordinate: { latitude: node.lat, longitude: node.lng },
    };
  }
}
