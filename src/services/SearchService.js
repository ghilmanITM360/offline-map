/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { IJTEMA_DATA, LANDMARK_PLACES } from '../constants/data';
import { FuzzySearchService } from './FuzzySearchService';
// Urdu digit → ASCII digit map for Urdu number search
const URDU_DIGITS = {
    '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
    '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
};
function normalizeUrdu(text) {
    return text.replace(/[۰-۹]/g, (ch) => URDU_DIGITS[ch] ?? ch);
}
function blockNumber(blockId) {
    return blockId.replace(/^B/, '');
}
// Category ordering for search result ranking (lower = higher priority)
const CATEGORY_RANK = {
    Block: 0,
    Gate: 1,
    Masjid: 2,
    Landmark: 3,
    Rasta: 4,
};
export class SearchService {
    static search(query, userLocation) {
        if (!query || query.trim().length === 0)
            return [];
        const raw = query.trim();
        const normalised = normalizeUrdu(raw).toLowerCase();
        const results = [];
        // ─── Blocks ────────────────────────────────────────────────────────────
        Object.entries(IJTEMA_DATA.blocks).forEach(([id, block]) => {
            const num = blockNumber(id);
            const friendlyName = block.name;
            const urduName = block.urduName ?? '';
            const matchesName = FuzzySearchService.matches(normalised, friendlyName.toLowerCase());
            const matchesNumber = normalised === num || normalised === `b${num}`;
            const matchesUrdu = urduName.includes(raw) || normalizeUrdu(urduName).toLowerCase().includes(normalised);
            const matchesAlias = block.aliases.some((a) => FuzzySearchService.matches(normalised, a.toLowerCase()));
            const matchesFuzzy = FuzzySearchService.matches(normalised, `block ${num}`);
            if (matchesName || matchesNumber || matchesUrdu || matchesAlias || matchesFuzzy) {
                results.push(this.blockToPlace(id, block));
            }
        });
        // ─── Landmarks (gates, masjid, POIs) ─────────────────────────────────
        LANDMARK_PLACES.forEach((lm) => {
            const nameMatch = FuzzySearchService.matches(normalised, lm.name.toLowerCase());
            const urduMatch = lm.urduName
                ? (lm.urduName.includes(raw) || normalizeUrdu(lm.urduName).toLowerCase().includes(normalised))
                : false;
            const aliasMatch = (lm.aliases ?? []).some((a) => a.toLowerCase().includes(normalised) ||
                FuzzySearchService.matches(normalised, a.toLowerCase()));
            if (nameMatch || urduMatch || aliasMatch) {
                if (!results.find((r) => r.id === lm.id))
                    results.push(lm);
            }
        });
        // ─── Named graph nodes (terminals, named road-ends) ──────────────────
        Object.entries(IJTEMA_DATA.nodes).forEach(([id, node]) => {
            if (!node.name)
                return;
            if (/^(P|S)\d+$/.test(id))
                return; // skip raw intersection IDs
            if (node.nearestRoadNode)
                return; // skip off-graph landmark nodes
            const matchesName = FuzzySearchService.matches(normalised, node.name.toLowerCase());
            const matchesUrdu = node.urduName ? node.urduName.includes(raw) : false;
            if (matchesName || matchesUrdu) {
                if (!results.find((r) => r.id === id))
                    results.push(this.nodeToPlace(id, node));
            }
        });
        // ─── Keyword shortcuts ─────────────────────────────────────────────────
        const keywords = {
            masjid: ['masjid', 'مسجد', 'mosque', 'prayer'],
            food: ['food', 'کھانا', 'water', 'پانی', 'langar', 'لنگر'],
            gate: ['gate', 'گیٹ', 'entrance', 'entry'],
            medical: ['medical', 'طبی', 'doctor', 'first aid', 'hospital'],
        };
        for (const [cat, terms] of Object.entries(keywords)) {
            if (terms.some((t) => normalised.includes(t))) {
                const catResults = this.searchByCategory(cat);
                catResults.forEach((p) => {
                    if (!results.find((r) => r.id === p.id))
                        results.push(p);
                });
            }
        }
        // ─── Sort: category rank first, then proximity if location provided ──
        results.sort((a, b) => {
            const rankA = CATEGORY_RANK[a.category] ?? 5;
            const rankB = CATEGORY_RANK[b.category] ?? 5;
            if (rankA !== rankB)
                return rankA - rankB;
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
    static searchByCategory(category) {
        const cat = category.toLowerCase();
        const results = [];
        if (cat === 'blocks') {
            Object.entries(IJTEMA_DATA.blocks).forEach(([id, block]) => {
                results.push(this.blockToPlace(id, block));
            });
        }
        else if (cat === 'gates' || cat === 'gate') {
            // Landmark gates first
            LANDMARK_PLACES.filter((lm) => lm.category === 'Gate').forEach((lm) => results.push(lm));
            // Then any graph nodes typed as gate
            Object.entries(IJTEMA_DATA.nodes).forEach(([id, node]) => {
                if (node.type === 'gate' && !results.find((r) => r.id === id)) {
                    results.push(this.nodeToPlace(id, node));
                }
            });
        }
        else if (cat === 'masjid') {
            LANDMARK_PLACES.filter((lm) => lm.category === 'Masjid').forEach((lm) => results.push(lm));
            Object.entries(IJTEMA_DATA.nodes).forEach(([id, node]) => {
                if (node.type === 'masjid' && !results.find((r) => r.id === id)) {
                    results.push(this.nodeToPlace(id, node));
                }
            });
        }
        else if (cat === 'rastas') {
            const seen = new Set();
            IJTEMA_DATA.edges.forEach((edge) => {
                if (!edge.name || seen.has(edge.name) || !edge.isRasta)
                    return;
                seen.add(edge.name);
                const fromNode = IJTEMA_DATA.nodes[edge.from];
                if (!fromNode)
                    return;
                results.push({
                    id: edge.name,
                    name: edge.name,
                    category: 'Rasta',
                    description: `Walking path: ${edge.name}`,
                    coordinate: { latitude: fromNode.lat, longitude: fromNode.lng },
                });
            });
        }
        else if (cat === 'food' || cat === 'medical') {
            const keyword = cat;
            LANDMARK_PLACES.forEach((lm) => {
                const aliases = lm.aliases ?? [];
                if (aliases.some((a) => a.toLowerCase().includes(keyword)))
                    results.push(lm);
            });
        }
        return results;
    }
    static getPlaceById(id) {
        // Landmark?
        const lm = LANDMARK_PLACES.find((l) => l.id === id);
        if (lm)
            return lm;
        const block = IJTEMA_DATA.blocks[id];
        if (block)
            return this.blockToPlace(id, block);
        const node = IJTEMA_DATA.nodes[id];
        if (node)
            return this.nodeToPlace(id, node);
        return null;
    }
    // ── Helpers ───────────────────────────────────────────────────────────────
    static blockToPlace(id, block) {
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
    static nodeToPlace(id, node) {
        let category = 'Landmark';
        let description = node.name ?? id;
        if (node.type === 'gate') {
            category = 'Gate';
            description = `Entry / exit gate — ${node.name ?? id}`;
        }
        else if (node.type === 'masjid') {
            category = 'Masjid';
            description = `Prayer area — ${node.name ?? id}`;
        }
        else if (node.type === 'road_end') {
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
