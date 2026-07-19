/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { IJTEMA_DATA, LANDMARK_PLACES } from '../constants/data';
import { Place } from '../models/types';
import { FuzzySearchService } from './FuzzySearchService';
import { MapFeatureFlagsService } from './MapFeatureFlagsService';
import { V2PlaceAdapter, V2Place } from './V2PlaceAdapter';

declare const __DEV__: boolean;

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

// Category ordering for search result ranking (lower = higher priority)
const CATEGORY_RANK: Record<string, number> = {
  Block: 0,
  Rasta: 1,
  SpecialRoute: 1,
  Gate: 2,
  Masjid: 3,
  Terminal: 4,
  Help: 5,
  Intersection: 6,
  RoadEndpoint: 7,
  Landmark: 8,
};

const DEBUG_NODE_SEARCH_ENABLED = typeof __DEV__ !== 'undefined' && __DEV__;

export interface SearchOptions {
  developerMode?: boolean;
}

export interface SearchCategoryChip {
  id: string;
  label: string;
}

const CATEGORY_CHIPS: SearchCategoryChip[] = [
  { id: 'all', label: 'All' },
  { id: 'blocks', label: 'Blocks' },
  { id: 'rastas', label: 'Rastas' },
  { id: 'gates', label: 'Gates' },
  { id: 'special_routes', label: 'Pindal' },
  { id: 'masjids', label: 'Masjids' },
  { id: 'terminals', label: 'Terminals' },
  { id: 'help', label: 'Help' },
];

export class SearchService {
  static search(query: string, userLocation?: { latitude: number; longitude: number }, options: SearchOptions = {}): Place[] {
    if (!query || query.trim().length === 0) return [];

    if (MapFeatureFlagsService.useIjtemaV2Map()) {
      return this.searchV2(query, userLocation, options);
    }

    const raw = query.trim();
    const normalised = normalizeUrdu(raw).toLowerCase();
    const exactBlockNumber = normalised.match(/^(?:block\s*|b)?0?([1-9]|1\d|2[0-4])$/)?.[1];

    const results: Place[] = [];

    // ─── Blocks ────────────────────────────────────────────────────────────
    Object.entries(IJTEMA_DATA.blocks).forEach(([id, block]) => {
      const num = blockNumber(id);
      const friendlyName = block.name;
      const urduName = block.urduName ?? '';

      const matchesNumber =
        normalised === num ||
        normalised === `b${num}` ||
        normalised === `b${num.padStart(2, '0')}` ||
        normalised === `block ${num}` ||
        normalised === `block ${num.padStart(2, '0')}`;
      if (exactBlockNumber && exactBlockNumber !== num) return;

      const matchesName    = FuzzySearchService.matches(normalised, friendlyName.toLowerCase());
      const matchesUrdu    = urduName.includes(raw) || normalizeUrdu(urduName).toLowerCase().includes(normalised);
      const matchesAlias   = block.aliases.some((a) => FuzzySearchService.matches(normalised, a.toLowerCase()));
      const matchesFuzzy   = FuzzySearchService.matches(normalised, `block ${num}`);

      if (matchesName || matchesNumber || matchesUrdu || matchesAlias || matchesFuzzy) {
        results.push(this.blockToPlace(id, block));
      }
    });

    if (exactBlockNumber) return results;

    // ─── Rastas (base navigation scope only) ──────────────────────────────
    this.searchByCategory('rastas').forEach((rasta) => {
      const name = rasta.name.toLowerCase();
      const aliases = rasta.aliases ?? [];
      const matches =
        FuzzySearchService.matches(normalised, name) ||
        aliases.some((alias) => FuzzySearchService.matches(normalised, alias.toLowerCase()));
      if (matches && !results.find((r) => r.id === rasta.id)) results.push(rasta);
    });

    // ─── Graph nodes (terminals, named road-ends, debug P/S nodes) ───────
    Object.entries(IJTEMA_DATA.nodes).forEach(([id, node]) => {
      const isDebugNode = /^(P\d+|S\d+|T\d+)$/.test(id);
      if (isDebugNode && !DEBUG_NODE_SEARCH_ENABLED) return;
      if (!node.name && !isDebugNode) return;
      if (node.nearestRoadNode && node.type !== 'gate' && node.type !== 'masjid') return;

      const displayName = node.name ?? id;
      const matchesName  = FuzzySearchService.matches(normalised, displayName.toLowerCase());
      const matchesUrdu  = node.urduName ? node.urduName.includes(raw) : false;
      const matchesRawId = id.toLowerCase() === normalised || id.toLowerCase().includes(normalised);
      if (matchesName || matchesUrdu || matchesRawId) {
        if (!results.find((r) => r.id === id)) results.push(this.nodeToPlace(id, node));
      }
    });

    // ─── Landmarks (help, medical, gates, masjid, terminals) ──────────────
    LANDMARK_PLACES.forEach((landmark) => {
      const matchesName = FuzzySearchService.matches(normalised, landmark.name.toLowerCase());
      const matchesUrdu = landmark.urduName ? landmark.urduName.includes(raw) : false;
      const matchesAlias = (landmark.aliases ?? []).some((a) => FuzzySearchService.matches(normalised, a.toLowerCase()));
      if ((matchesName || matchesUrdu || matchesAlias) && !results.find((r) => r.id === landmark.id)) {
        results.push(landmark);
      }
    });

    // ─── Sort: category rank first, then proximity if location provided ──
    results.sort((a, b) => {
      const rankA = CATEGORY_RANK[a.category] ?? 5;
      const rankB = CATEGORY_RANK[b.category] ?? 5;
      if (rankA !== rankB) return rankA - rankB;
      if (userLocation) {
        const distA = Math.abs(a.coordinate.latitude - userLocation.latitude) +
                      Math.abs(a.coordinate.longitude - userLocation.longitude);
        const distB = Math.abs(b.coordinate.latitude - userLocation.latitude) +
                      Math.abs(b.coordinate.longitude - userLocation.longitude);
        return distA - distB;
      }
      return 0;
    });

    return results;
  }

  static searchByCategory(category: string): Place[] {
    if (MapFeatureFlagsService.useIjtemaV2Map()) {
      return this.searchByCategoryV2(category);
    }

    const cat = category.toLowerCase();
    if (cat === 'all') {
      const grouped = new Map<string, Place>();
      for (const categoryId of CATEGORY_CHIPS.map((c) => c.id).filter((id) => id !== 'all')) {
        for (const place of this.searchByCategory(categoryId)) {
          grouped.set(place.id, place);
        }
      }
      return Array.from(grouped.values());
    }

    const results: Place[] = [];

    if (cat === 'blocks') {
      Object.entries(IJTEMA_DATA.blocks).forEach(([id, block]) => {
        results.push(this.blockToPlace(id, block));
      });
    } else if (cat === 'rastas') {
      const grouped = new Map<string, Set<string>>();
      IJTEMA_DATA.edges.forEach((edge) => {
        if (!edge.name || !edge.isRasta) return;
        if (!edge.name.startsWith('Rasta')) return;
        const nodes = grouped.get(edge.name) ?? new Set<string>();
        nodes.add(edge.from);
        nodes.add(edge.to);
        grouped.set(edge.name, nodes);
      });

      grouped.forEach((nodeSet, rastaName) => {
        const preferredNodeId =
          Array.from(nodeSet).find((nodeId) => nodeId.startsWith('P')) ?? Array.from(nodeSet)[0];
        const node = preferredNodeId ? IJTEMA_DATA.nodes[preferredNodeId] : null;
        if (!node) return;
        const rastaNumber = rastaName.replace('Rasta ', '');
        results.push({
          id: rastaName,
          name: rastaName,
          category: 'Rasta',
          description: `Base walking path: ${rastaName}`,
          coordinate: { latitude: node.lat, longitude: node.lng },
          routingNodeId: preferredNodeId,
          resolvedRoutingNodeId: preferredNodeId,
          resolvedRoutingCoordinate: { latitude: node.lat, longitude: node.lng },
          aliases: [`rasta ${rastaNumber}`, `road ${rastaNumber}`, `r${rastaNumber}`],
          sourceVersion: 'v1',
        });
      });
    } else if (cat === 'gates') {
      this.searchNodesByType('gate').forEach((place) => results.push(place));
      LANDMARK_PLACES.filter((landmark) => landmark.category === 'Gate').forEach((landmark) => results.push(landmark));
    } else if (cat === 'masjids') {
      this.searchNodesByType('masjid').forEach((place) => results.push(place));
      LANDMARK_PLACES.filter((landmark) => landmark.category === 'Masjid').forEach((landmark) => results.push(landmark));
      Object.entries(IJTEMA_DATA.blocks).forEach(([id, block]) => {
        const role = (block.role ?? '').toLowerCase();
        const aliasHit = (block.aliases ?? []).some((alias) => alias.toLowerCase().includes('masjid') || alias.toLowerCase().includes('mosque'));
        if (!role.includes('masjid') && !aliasHit) return;
        const place = this.blockToPlace(id, block);
        results.push({
          ...place,
          category: 'Masjid',
          description: `${place.name} (Member Masjid area)`,
        });
      });
    } else if (cat === 'terminals') {
      Object.entries(IJTEMA_DATA.nodes).forEach(([id, node]) => {
        if (node.name?.toLowerCase().includes('terminal') || id.startsWith('T')) {
          const place = this.nodeToPlace(id, node);
          results.push({ ...place, category: 'Terminal', description: place.description });
        }
      });
      LANDMARK_PLACES.filter((landmark) => landmark.name.toLowerCase().includes('terminal')).forEach((landmark) =>
        results.push({ ...landmark, category: 'Terminal' as Place['category'] }),
      );
    } else if (cat === 'help') {
      LANDMARK_PLACES.filter((landmark) => {
        const text = `${landmark.name} ${(landmark.aliases ?? []).join(' ')}`.toLowerCase();
        return (
          text.includes('help') ||
          text.includes('medical') ||
          text.includes('first aid') ||
          text.includes('emergency') ||
          text.includes('volunteer') ||
          text.includes('lost')
        );
      }).forEach((landmark) => results.push({ ...landmark, category: 'Help' as Place['category'] }));
    }

    const uniq = new Map<string, Place>();
    results.forEach((place) => uniq.set(place.id, place));
    return Array.from(uniq.values());
  }

  static getAvailableCategoryChips(): SearchCategoryChip[] {
    return CATEGORY_CHIPS.filter((chip) => chip.id === 'all' || this.searchByCategory(chip.id).length > 0);
  }

  static getPlaceById(id: string): Place | null {
    if (MapFeatureFlagsService.useIjtemaV2Map()) {
      const v2Place = V2PlaceAdapter.getPlaceById(id);
      return v2Place ?? null;
    }

    const block = (IJTEMA_DATA.blocks as any)[id];
    if (block) return this.blockToPlace(id, block);

    const node = (IJTEMA_DATA.nodes as any)[id];
    if (node) return this.nodeToPlace(id, node);

    const rasta = this.searchByCategory('rastas').find((place) => place.id === id);
    if (rasta) return rasta;

    const landmark = LANDMARK_PLACES.find((place) => place.id === id);
    if (landmark) return landmark;

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
      sourceVersion: 'v1',
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
    } else if (node.type === 'intersection') {
      category = 'Intersection';
      description = `Graph intersection ${id}`;
    } else if (node.type === 'road_end') {
      category = 'RoadEndpoint';
      description = node.name ?? id;
      if (node.name?.toLowerCase().includes('terminal') || id.startsWith('T')) {
        category = 'Terminal' as Place['category'];
      }
    }

    return {
      id,
      name: node.name ?? id,
      urduName: node.urduName,
      category,
      description,
      coordinate: { latitude: node.lat, longitude: node.lng },
      routingNodeId: node.nearestRoadNode ?? id,
      resolvedRoutingNodeId: node.nearestRoadNode ?? id,
      resolvedRoutingCoordinate: node.nearestRoadNode
        ? {
            latitude: IJTEMA_DATA.nodes[node.nearestRoadNode].lat,
            longitude: IJTEMA_DATA.nodes[node.nearestRoadNode].lng,
          }
        : { latitude: node.lat, longitude: node.lng },
      aliases: node.type === 'gate' ? [id.toLowerCase(), id, node.name ?? id, 'gate', 'masjid gate'] : undefined,
      sourceVersion: 'v1',
    };
  }

  private static searchNodesByType(type: string): Place[] {
    const results: Place[] = [];
    Object.entries(IJTEMA_DATA.nodes).forEach(([id, node]) => {
      if (node.type !== type) return;
      results.push(this.nodeToPlace(id, node));
    });
    return results;
  }

  private static searchV2(query: string, userLocation?: { latitude: number; longitude: number }, options: SearchOptions = {}): Place[] {
    const raw = query.trim();
    const normalised = normalizeUrdu(raw).toLowerCase();
    const places = V2PlaceAdapter.getAllPlaces({
      developerMode: options.developerMode,
      includeUnavailableGates: true,
    });
    const exactGateNumber = normalised.match(/^(?:gate\s*|g)0?([1-9]|1\d|2[0-2])$/)?.[1];
    const exactBlockNumber = normalised.match(/^(?:block\s*|b)?0?([1-9]|[1-3]\d|4[0-2])$/)?.[1];

    const results: V2Place[] = [];
    for (const place of places) {
      const aliases = place.aliases ?? [];
      const isMissingGate = place.category === 'Gate' && place.routingStatus === 'missing_coordinate';
      const gateNumber = place.category === 'Gate' ? Number(place.id.replace('GATE_', '')) : null;
      const blockNumber = place.category === 'Block' ? Number(place.id.replace('B', '')) : null;

      if (exactGateNumber && gateNumber !== Number(exactGateNumber)) continue;
      if (exactBlockNumber && blockNumber !== Number(exactBlockNumber)) continue;

      const matchesName = FuzzySearchService.matches(normalised, place.name.toLowerCase());
      const matchesUrdu = place.urduName ? normalizeUrdu(place.urduName).toLowerCase().includes(normalised) || place.urduName.includes(raw) : false;
      const matchesAlias = aliases.some((alias) => {
        const normalizedAlias = normalizeUrdu(alias).toLowerCase();
        return FuzzySearchService.matches(normalised, normalizedAlias) || normalizedAlias.includes(normalised);
      });
      const matchesId = place.id.toLowerCase() === normalised;
      const exactMissingGateHit = isMissingGate && exactGateNumber && gateNumber === Number(exactGateNumber);

      if ((isMissingGate && !exactMissingGateHit) || !(matchesName || matchesUrdu || matchesAlias || matchesId || exactMissingGateHit)) {
        continue;
      }

      if (!results.find((existing) => existing.id === place.id)) {
        results.push(place);
      }
    }

    const matchPriority = (place: V2Place): number => {
      const aliases = place.aliases ?? [];
      const normalizedUrduName = place.urduName ? normalizeUrdu(place.urduName).toLowerCase() : '';
      const normalizedAliases = aliases.map((alias) => normalizeUrdu(alias).toLowerCase());

      if (
        place.id.toLowerCase() === normalised ||
        place.name.toLowerCase() === normalised ||
        normalizedUrduName === normalised ||
        normalizedAliases.some((alias) => alias === normalised)
      ) {
        return 0;
      }

      if (
        place.name.toLowerCase().startsWith(normalised) ||
        normalizedUrduName.startsWith(normalised) ||
        normalizedAliases.some((alias) => alias.startsWith(normalised))
      ) {
        return 1;
      }

      return 2;
    };

    results.sort((a, b) => {
      const priorityA = matchPriority(a);
      const priorityB = matchPriority(b);
      if (priorityA !== priorityB) return priorityA - priorityB;

      const rankA = CATEGORY_RANK[a.category] ?? 5;
      const rankB = CATEGORY_RANK[b.category] ?? 5;
      if (rankA !== rankB) return rankA - rankB;
      if (userLocation && a.coordinate && b.coordinate) {
        const distA = Math.abs(a.coordinate.latitude - userLocation.latitude) +
                      Math.abs(a.coordinate.longitude - userLocation.longitude);
        const distB = Math.abs(b.coordinate.latitude - userLocation.latitude) +
                      Math.abs(b.coordinate.longitude - userLocation.longitude);
        return distA - distB;
      }
      return 0;
    });

    return results;
  }

  private static searchByCategoryV2(category: string): Place[] {
    const cat = category.toLowerCase();
    if (cat === 'all') {
      const grouped = new Map<string, Place>();
      ['blocks', 'rastas', 'gates', 'special_routes'].forEach((categoryId) => {
        V2PlaceAdapter.getPlacesByCategory(categoryId).forEach((place) => grouped.set(place.id, place));
      });
      return Array.from(grouped.values());
    }

    if (cat === 'blocks' || cat === 'rastas' || cat === 'gates' || cat === 'special_routes') {
      return V2PlaceAdapter.getPlacesByCategory(cat);
    }

    return [];
  }
}
