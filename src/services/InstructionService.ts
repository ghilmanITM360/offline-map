/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { IJTEMA_DATA } from '../constants/data';
import { getRhumbLineBearing } from 'geolib';
import { NavigationInstruction } from '../models/types';
import type { Locale, MessageKey } from '../i18n';
import { bothLocales, getLocale, t, tIn, tn, venueName } from './serviceI18n';

export type Instruction = NavigationInstruction;

/** Junction nodes are named after the two roads that meet there (rasta numbers, or the middle road). */
type Road = number | 'middle';
const INTERSECTION_ROADS: Record<string, [Road, Road]> = {
  P1:  [9, 1],
  P2:  [9, 2],
  P3:  [9, 3],
  P4:  [9, 4],
  P5:  [9, 5],
  P6:  ['middle', 2],
  P7:  ['middle', 5],
  P8:  [11, 1],
  P9:  [11, 2],
  P10: [11, 3],
  P11: [11, 4],
  P12: [11, 5],
};

const roadLabel = (road: Road, locale: Locale): string =>
  road === 'middle' ? tIn(locale, 'routeGuide.middleRoad') : venueName(`Rasta ${String(road).padStart(2, '0')}`, locale);

const GATE_NAME_KEYS: Record<string, MessageKey> = {
  C1: 'routeGuide.memberMasjidSouthWest',
  C2: 'routeGuide.memberMasjidSouthEast',
  C3: 'routeGuide.memberMasjidNorthWest',
  C4: 'routeGuide.memberMasjidNorthEast',
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

      let build: (locale: Locale) => string;
      let type: 'straight' | 'left' | 'right' | 'arrival' = 'straight';

      const roadName = this.getRoadName(currentId, nextId, getLocale());
      const edge = (locale: Locale) => this.getRoadName(currentId, nextId, locale) ?? tIn(locale, 'routeGuide.thePath');

      if (i === 0) {
        build = (locale) => tIn(locale, 'routeGuide.v1Start', {
          road: edge(locale), distance, place: this.getFriendlyName(nextId, locale),
        });
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

        if (Math.abs(diff) < 30) {
          build = (locale) => tIn(locale, 'routeGuide.v1Straight', {
            distance, road: edge(locale), place: this.getFriendlyName(nextId, locale),
          });
          type = 'straight';
        } else {
          type = diff > 0 ? 'right' : 'left';
          const turnKey = diff > 0 ? 'routeGuide.v1Right' : 'routeGuide.v1Left';
          build = (locale) => tIn(locale, turnKey, { at: this.getFriendlyName(currentId, locale), road: edge(locale) });
        }
      }

      instructions.push({
        id: `inst_${i}`,
        ...bothLocales(build),
        distance,
        type,
        coordinate: { latitude: nextNode.lat, longitude: nextNode.lng },
        roadName,
      });
    }

    // Arrival step
    const lastNodeId = nodeIds[nodeIds.length - 1];
    const lastNode = (IJTEMA_DATA.nodes as any)[lastNodeId];
    if (!lastNode) return instructions; // fixed: guard against missing destination nodes before reading coordinates

    instructions.push({
      id: `inst_${nodeIds.length - 1}`,
      ...bothLocales((locale) => tIn(locale, 'routeGuide.arrive', { place: this.getFriendlyName(lastNodeId, locale) })),
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

  /** The named road/rasta between two nodes in `locale`, or undefined when the edge has no real name. */
  private static getRoadName(fromId: string, toId: string, locale: Locale): string | undefined {
    const edge = IJTEMA_DATA.edges.find(
      (e) => (e.from === fromId && e.to === toId) || (e.from === toId && e.to === fromId)
    );
    return edge?.name ? venueName(edge.name, locale) : undefined;
  }

  private static getFriendlyName(nodeId: string, locale: Locale): string {
    // Check intersection lookup table first
    const roads = INTERSECTION_ROADS[nodeId];
    if (roads) return tIn(locale, 'routeGuide.junctionName', { a: roadLabel(roads[0], locale), b: roadLabel(roads[1], locale) });

    const gateKey = GATE_NAME_KEYS[nodeId];
    if (gateKey) return tIn(locale, gateKey);

    const node = (IJTEMA_DATA.nodes as any)[nodeId];
    if (!node) return tIn(locale, 'routeGuide.destination');

    if (locale === 'ur' && node.urduName) return node.urduName;
    if (node.name) return venueName(node.name, locale);

    // Check if it's an entry point for a block
    const block = Object.values(IJTEMA_DATA.blocks).find((b) => b.entry_nodes.includes(nodeId));
    if (block) return tIn(locale, 'routeGuide.blockEntrance', { block: venueName({ en: block.name, ur: block.urduName }, locale) });

    return tIn(locale, 'routeGuide.theJunction');
  }

  /**
   * Short caps-style maneuver label for the nav banner's top line (Google
   * Maps style hierarchy) — derived from the instruction's existing `type`,
   * not a new instruction field.
   */
  static maneuverLabel(type: NavigationInstruction['type']): string {
    switch (type) {
      case 'left': return t('navigation.maneuverLeft');
      case 'right': return t('navigation.maneuverRight');
      case 'arrival': return t('navigation.maneuverArrive');
      default: return t('navigation.maneuverStraight');
    }
  }

  /**
   * Road-name line for a step. Arrival steps carry no roadName, so they name the destination
   * (V1 `destination.name`, V2 `route.destination.label`). A step with no road name has no line at all:
   * "Continue Straight" followed by "Continue ahead" said the same thing twice.
   */
  static stepRoadLine(step: Pick<NavigationInstruction, 'type' | 'roadName'>, destinationName?: string | null): string {
    if (step.type === 'arrival') {
      const place = destinationName?.trim();
      return place ? venueName(place) : t('navigation.yourDestination');
    }
    return step.roadName?.trim() || '';
  }

  /** Short next-step preview: "Then: Left Turn onto Rasta 05" / "Then: Arrive at Gate 8". */
  static nextStepPreview(step: Pick<NavigationInstruction, 'type' | 'roadName'>, destinationName?: string | null): string {
    const maneuver = InstructionService.maneuverLabel(step.type);
    if (step.type === 'arrival') {
      const place = destinationName?.trim();
      return place
        ? t('navigation.nextThenAt', { maneuver, place: venueName(place) })
        : t('navigation.nextThenAtDestination', { maneuver });
    }
    const road = step.roadName?.trim();
    return road ? t('navigation.nextThenOnto', { maneuver, road }) : t('navigation.nextThen', { maneuver });
  }

  /**
   * Format a distance value according to the user's unit preference.
   * Returns a display string like "120 m" or "394 ft" (the unit is a word in the chosen language). Distances at or
   * above 1 km / 1 mile switch to that unit (1 decimal place) — plain-language
   * for elderly/low-literacy users instead of raw large meter/foot counts.
   */
  static formatDistance(meters: number, unit: 'meters' | 'feet' = 'meters'): string {
    if (unit === 'feet') {
      const feet = meters * 3.28084;
      if (feet >= 5280) {
        return t('navigation.distanceMiles', { value: (feet / 5280).toFixed(1) });
      }
      return t('navigation.distanceFeet', { value: Math.round(feet) });
    }
    if (meters >= 1000) {
      return t('navigation.distanceKilometers', { value: (meters / 1000).toFixed(1) });
    }
    return t('navigation.distanceMeters', { value: Math.round(meters) });
  }

  /**
   * Format a duration in minutes as plain language ("45 min", "2 hr 39 min")
   * instead of raw large minute counts.
   */
  static formatDuration(minutes: number): string {
    const wholeMinutes = Math.round(minutes);
    if (wholeMinutes < 60) {
      return t('navigation.durationMinutes', { minutes: wholeMinutes });
    }
    const hours = Math.floor(wholeMinutes / 60);
    const remainingMinutes = wholeMinutes % 60;
    return remainingMinutes > 0
      ? tn('navigation.durationHoursMinutes', hours, { hours, minutes: remainingMinutes })
      : tn('navigation.durationHours', hours, { hours });
  }

  /** Clock time for an arrival estimate. Digits stay 0-9 in every language. */
  static formatClockTime(date: Date): string {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', numberingSystem: 'latn' } as Intl.DateTimeFormatOptions);
  }
}
