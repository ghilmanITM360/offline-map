/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { IJTEMA_DATA } from '../constants/data';
import { Place } from '../models/types';

export class SearchService {
  static search(query: string): Place[] {
    if (!query) return [];
    
    const results: Place[] = [];
    const normalizedQuery = query.toLowerCase();

    // Search Blocks
    Object.entries(IJTEMA_DATA.blocks).forEach(([id, block]) => {
      if (block.name.toLowerCase().includes(normalizedQuery) || id.toLowerCase().includes(normalizedQuery)) {
        results.push({
          id,
          name: `Block ${id}`,
          category: 'Block',
          description: `Main residential block area ${id} for pilgrims. Near entries: ${block.entry_nodes.join(', ')}.`,
          coordinate: block.center
        });
      }
    });

    // Search Nodes (Masjids, Gates, etc.)
    Object.entries(IJTEMA_DATA.nodes).forEach(([id, node]) => {
      if (id.toLowerCase().includes(normalizedQuery)) {
        const isGate = id.startsWith('G');
        const isMasjid = id.startsWith('M');
        
        results.push({
          id,
          name: isGate ? `Gate ${id}` : isMasjid ? `Masjid ${id}` : `Point ${id}`,
          category: isGate ? 'Gate' : isMasjid ? 'Masjid' : 'Landmark',
          description: isGate ? `Entry/Exit point ${id} for the ground.` : isMasjid ? `Prayer area ${id}.` : `Location point.`,
          coordinate: { latitude: node.lat, longitude: node.lng }
        });
      }
    });

    return results;
  }

  static getPlaceById(id: string): Place | null {
    const block = (IJTEMA_DATA.blocks as any)[id];
    if (block) {
      return {
        id,
        name: `Block ${id}`,
        category: 'Block',
        description: `Main residential block area ${id} for pilgrims.`,
        coordinate: block.center
      };
    }

    const node = (IJTEMA_DATA.nodes as any)[id];
    if (node) {
      const isGate = id.startsWith('G');
      const isMasjid = id.startsWith('M');
      
      return {
        id,
        name: isGate ? `Gate ${id}` : isMasjid ? `Masjid ${id}` : `Point ${id}`,
        category: isGate ? 'Gate' : isMasjid ? 'Masjid' : 'Landmark',
        description: isGate ? `Entry/Exit point ${id} for the ground.` : isMasjid ? `Prayer area ${id}.` : `Location point.`,
        coordinate: { latitude: node.lat, longitude: node.lng }
      };
    }

    return null;
  }
}
