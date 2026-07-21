/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { IJTEMA_DATA } from '../constants/data';
import { getRhumbLineBearing } from 'geolib';
import { NavigationInstruction } from '../models/types';

export type Instruction = NavigationInstruction;

/** Human-readable names for intersection nodes */
const INTERSECTION_NAMES: Record<string, { en: string; ur: string }> = {
  P1:  { en: 'Rasta 09 & Rasta 01 Junction',  ur: 'راستہ ۰۹ اور راستہ ۰۱ چوراہا' },
  P2:  { en: 'Rasta 09 & Rasta 02 Junction',  ur: 'راستہ ۰۹ اور راستہ ۰۲ چوراہا' },
  P3:  { en: 'Rasta 09 & Rasta 03 Junction',  ur: 'راستہ ۰۹ اور راستہ ۰۳ چوراہا' },
  P4:  { en: 'Rasta 09 & Rasta 04 Junction',  ur: 'راستہ ۰۹ اور راستہ ۰۴ چوراہا' },
  P5:  { en: 'Rasta 09 & Rasta 05 Junction',  ur: 'راستہ ۰۹ اور راستہ ۰۵ چوراہا' },
  P6:  { en: 'Middle Road & Rasta 02 Junction', ur: 'درمیانی سڑک اور راستہ ۰۲ چوراہا' },
  P7:  { en: 'Middle Road & Rasta 05 Junction', ur: 'درمیانی سڑک اور راستہ ۰۵ چوراہا' },
  P8:  { en: 'Rasta 11 & Rasta 01 Junction',  ur: 'راستہ ۱۱ اور راستہ ۰۱ چوراہا' },
  P9:  { en: 'Rasta 11 & Rasta 02 Junction',  ur: 'راستہ ۱۱ اور راستہ ۰۲ چوراہا' },
  P10: { en: 'Rasta 11 & Rasta 03 Junction',  ur: 'راستہ ۱۱ اور راستہ ۰۳ چوراہا' },
  P11: { en: 'Rasta 11 & Rasta 04 Junction',  ur: 'راستہ ۱۱ اور راستہ ۰۴ چوراہا' },
  P12: { en: 'Rasta 11 & Rasta 05 Junction',  ur: 'راستہ ۱۱ اور راستہ ۰۵ چوراہا' },
};

const GATE_NAMES: Record<string, { en: string; ur: string }> = {
  C1: { en: 'Member Masjid south-west gate', ur: 'ممبر مسجد جنوب مغربی گیٹ' },
  C2: { en: 'Member Masjid south-east gate', ur: 'ممبر مسجد جنوب مشرقی گیٹ' },
  C3: { en: 'Member Masjid north-west gate', ur: 'ممبر مسجد شمال مغربی گیٹ' },
  C4: { en: 'Member Masjid north-east gate', ur: 'ممبر مسجد شمال مشرقی گیٹ' },
};

export class InstructionService {
  static generateInstructions(nodeIds: string[]): NavigationInstruction[] {
    if (nodeIds.length === 0) return []; // fixed: guard against empty routes before reading the last node

    const instructions: NavigationInstruction[] = [];

    for (let i = 0; i < nodeIds.length - 1; i++) {
      const currentId = nodeIds[i];
      const nextId = nodeIds[i + 1];

      const currentNode = (IJTEMA_DATA.nodes as any)[currentId];
      const nextNode = (IJTEMA_DATA.nodes as any)[nextId];
      if (!currentNode || !nextNode) continue; // fixed: skip malformed segments instead of crashing on missing node data

      const distance = this.getEdgeDistance(currentId, nextId);

      let text = '';
      let urduText = '';
      let type: 'straight' | 'left' | 'right' | 'arrival' = 'straight';

      const nextNameUr = this.getFriendlyName(nextId, 'ur');
      const nextName = this.getFriendlyName(nextId, 'en');
      const edgeName = this.getEdgeName(currentId, nextId);

      if (i === 0) {
        text = `Start on ${edgeName}. Continue ${distance} meters to ${nextName}.`;
        urduText = `${edgeName} پر چلیں۔ ${nextNameUr} تک ${distance} میٹر جائیں`;
      } else {
        const prevId = nodeIds[i - 1];
        const prevNode = (IJTEMA_DATA.nodes as any)[prevId];
        if (!prevNode) continue; // fixed: skip turn-calculation work when the previous node is missing from the dataset

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

        const atName = this.getFriendlyName(currentId, 'en');
        const atNameUr = this.getFriendlyName(currentId, 'ur');

        if (Math.abs(diff) < 30) {
          text = `Continue ${distance} meters on ${edgeName} to ${nextName}.`;
          urduText = `${nextNameUr} تک ${distance} میٹر سیدھا جائیں`;
          type = 'straight';
        } else if (diff > 0) {
          text = `Turn right at ${atName} onto ${edgeName}.`;
          urduText = `${atNameUr} پر ${edgeName} کی طرف دائیں مڑیں`;
          type = 'right';
        } else {
          text = `Turn left at ${atName} onto ${edgeName}.`;
          urduText = `${atNameUr} پر ${edgeName} کی طرف بائیں مڑیں`;
          type = 'left';
        }
      }

      instructions.push({
        id: `inst_${i}`,
        text,
        urduText,
        distance,
        type,
        coordinate: { latitude: nextNode.lat, longitude: nextNode.lng },
      });
    }

    // Arrival step
    const lastNodeId = nodeIds[nodeIds.length - 1];
    const lastNode = (IJTEMA_DATA.nodes as any)[lastNodeId];
    if (!lastNode) return instructions; // fixed: guard against missing destination nodes before reading coordinates
    const destName = this.getFriendlyName(lastNodeId, 'en');
    const destNameUr = this.getFriendlyName(lastNodeId, 'ur');

    instructions.push({
      id: `inst_${nodeIds.length - 1}`,
      text: `You have reached ${destName}.`,
      urduText: `${destNameUr} پہنچ گئے`,
      distance: 0,
      type: 'arrival',
      coordinate: { latitude: lastNode.lat, longitude: lastNode.lng },
    });

    return instructions;
  }

  private static getEdgeDistance(id1: string, id2: string): number {
    const edge = IJTEMA_DATA.edges.find(
      (e) => (e.from === id1 && e.to === id2) || (e.from === id2 && e.to === id1)
    );
    return edge ? edge.distance_m : 0;
  }

  private static getEdgeName(fromId: string, toId: string): string {
    const edge = IJTEMA_DATA.edges.find(
      (e) => (e.from === fromId && e.to === toId) || (e.from === toId && e.to === fromId)
    );
    return edge?.name ?? 'the path';
  }

  private static getFriendlyName(nodeId: string, lang: 'en' | 'ur'): string {
    // Check intersection lookup table first
    const inter = INTERSECTION_NAMES[nodeId];
    if (inter) return lang === 'ur' ? inter.ur : inter.en;

    const gate = GATE_NAMES[nodeId];
    if (gate) return lang === 'ur' ? gate.ur : gate.en;

    const node = (IJTEMA_DATA.nodes as any)[nodeId];
    if (!node) return lang === 'ur' ? 'منزل' : 'destination';

    if (lang === 'ur' && node.urduName) return node.urduName;
    if (node.name) return node.name;

    // Check if it's an entry point for a block
    const block = Object.values(IJTEMA_DATA.blocks).find((b) => b.entry_nodes.includes(nodeId));
    if (block) {
      return lang === 'ur'
        ? (block.urduName ?? block.name) + ' گیٹ'
        : `${block.name} Entrance`;
    }

    return lang === 'ur' ? 'چوراہا' : 'the junction';
  }

  /**
   * Format a distance value according to the user's unit preference.
   * Returns a display string like "120 m" or "394 ft". Distances at or
   * above 1 km / 1 mile switch to that unit (1 decimal place) — plain-language
   * for elderly/low-literacy users instead of raw large meter/foot counts.
   */
  static formatDistance(meters: number, unit: 'meters' | 'feet' = 'meters'): string {
    if (unit === 'feet') {
      const feet = meters * 3.28084;
      if (feet >= 5280) {
        return `${(feet / 5280).toFixed(1)} mi`;
      }
      return `${Math.round(feet)} ft`;
    }
    if (meters >= 1000) {
      return `${(meters / 1000).toFixed(1)} km`;
    }
    return `${Math.round(meters)} m`;
  }

  /**
   * Format a duration in minutes as plain language ("45 min", "2 hr 39 min")
   * instead of raw large minute counts.
   */
  static formatDuration(minutes: number): string {
    const wholeMinutes = Math.round(minutes);
    if (wholeMinutes < 60) {
      return `${wholeMinutes} min`;
    }
    const hours = Math.floor(wholeMinutes / 60);
    const remainingMinutes = wholeMinutes % 60;
    return remainingMinutes > 0 ? `${hours} hr ${remainingMinutes} min` : `${hours} hr`;
  }
}
