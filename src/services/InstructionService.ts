/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { IJTEMA_DATA } from '../constants/data';
import { getRhumbLineBearing } from 'geolib';
import { NavigationInstruction } from '../models/types';

export type Instruction = NavigationInstruction;

export class InstructionService {
  static generateInstructions(nodeIds: string[]): NavigationInstruction[] {
    const instructions: NavigationInstruction[] = [];
    
    for (let i = 0; i < nodeIds.length - 1; i++) {
      const currentId = nodeIds[i];
      const nextId = nodeIds[i + 1];

      const currentNode = (IJTEMA_DATA.nodes as any)[currentId];
      const nextNode = (IJTEMA_DATA.nodes as any)[nextId];
      
      const distance = this.getDistance(currentId, nextId);
      
      let text = "";
      let type: 'straight' | 'left' | 'right' | 'arrival' = 'straight';

      if (i === 0) {
        text = `Head toward ${this.getFriendlyName(nextId)}`;
      } else {
        const prevId = nodeIds[i - 1];
        const prevNode = (IJTEMA_DATA.nodes as any)[prevId];
        
        const bearing1 = getRhumbLineBearing(
          { latitude: prevNode.lat, longitude: prevNode.lng },
          { latitude: currentNode.lat, longitude: currentNode.lng }
        );
        const bearing2 = getRhumbLineBearing(
          { latitude: currentNode.lat, longitude: currentNode.lng },
          { latitude: nextNode.lat, longitude: nextNode.lng }
        );

        let diff = bearing2 - bearing1;
        if (diff > 180) diff -= 360;
        if (diff < -180) diff += 360;

        if (Math.abs(diff) < 30) {
          text = `Continue straight past ${this.getNearbyBlock(currentId)}`;
          type = 'straight';
        } else if (diff > 0) {
          text = `Turn right after ${this.getNearbyBlock(currentId)}`;
          type = 'right';
        } else {
          text = `Turn left after ${this.getNearbyBlock(currentId)}`;
          type = 'left';
        }
      }

      instructions.push({ 
        id: `inst_${i}`,
        text, 
        distance, 
        type,
        coordinate: { latitude: currentNode.lat, longitude: currentNode.lng }
      });
    }

    const lastNodeId = nodeIds[nodeIds.length - 1];
    const lastNode = (IJTEMA_DATA.nodes as any)[lastNodeId];
    instructions.push({
      id: `inst_${nodeIds.length - 1}`,
      text: `Arrive at ${this.getFriendlyName(lastNodeId)}`,
      distance: 0,
      type: 'arrival',
      coordinate: { latitude: lastNode.lat, longitude: lastNode.lng }
    });

    return instructions;
  }

  private static getDistance(id1: string, id2: string): number {
    const edge = IJTEMA_DATA.edges.find(e => 
      (e.from === id1 && e.to === id2) || (e.from === id2 && e.to === id1)
    );
    return edge ? edge.distance_m : 0;
  }

  private static getFriendlyName(nodeId: string): string {
    const node = (IJTEMA_DATA.nodes as any)[nodeId];
    if (node.name) return node.name;
    
    // Find if it's an entry point for a block
    const block = Object.values(IJTEMA_DATA.blocks).find(b => b.entry_nodes.includes(nodeId));
    if (block) return `Gate of ${block.name}`;

    return "the next intersection";
  }

  private static getNearbyBlock(nodeId: string): string {
    const block = Object.values(IJTEMA_DATA.blocks).find(b => b.entry_nodes.includes(nodeId));
    return block ? block.name : "the intersection";
  }
}
