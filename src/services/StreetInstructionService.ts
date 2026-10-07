/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { getRhumbLineBearing } from 'geolib';
import { Coordinate as AppCoordinate, V2NavigationInstruction } from '../models/types';
import type { Locale, MessageKey } from '../i18n';
import { bothLocales, tIn, venueName } from './serviceI18n';

/**
 * Finer-grained turn classification than v1's single 30° threshold
 * (src/services/InstructionService.ts) — the street graph has real
 * intersections at varying angles, not just the venue's mostly-orthogonal
 * rasta grid. `maneuver` drives instruction wording; `type` stays the
 * existing 4-value set (straight/left/right/arrival) so StepIcon and other
 * v1-shared consumers don't need to change.
 */
export type StreetManeuver =
  | 'straight'
  | 'slight_left'
  | 'slight_right'
  | 'left'
  | 'right'
  | 'sharp_left'
  | 'sharp_right'
  | 'u_turn'
  | 'arrival';

export interface V2StreetNavigationInstruction extends V2NavigationInstruction {
  maneuver: StreetManeuver;
}

const classifyTurn = (diffDeg: number): StreetManeuver => {
  const abs = Math.abs(diffDeg);
  if (abs < 15) return 'straight';
  if (abs < 45) return diffDeg > 0 ? 'slight_right' : 'slight_left';
  if (abs < 120) return diffDeg > 0 ? 'right' : 'left';
  if (abs < 160) return diffDeg > 0 ? 'sharp_right' : 'sharp_left';
  return 'u_turn';
};

const coarseType = (maneuver: StreetManeuver): V2NavigationInstruction['type'] => {
  if (maneuver === 'arrival') return 'arrival';
  if (maneuver.includes('left')) return 'left';
  if (maneuver.includes('right')) return 'right';
  return 'straight';
};

const MANEUVER_KEYS: Record<StreetManeuver, MessageKey> = {
  slight_left: 'routeGuide.turnBearLeft',
  slight_right: 'routeGuide.turnBearRight',
  left: 'routeGuide.turnLeft',
  right: 'routeGuide.turnRight',
  sharp_left: 'routeGuide.turnSharpLeft',
  sharp_right: 'routeGuide.turnSharpRight',
  u_turn: 'routeGuide.turnUTurn',
  straight: 'routeGuide.turnStraight',
  arrival: 'routeGuide.turnStraight',
};

const bearing = (from: AppCoordinate, to: AppCoordinate): number =>
  getRhumbLineBearing(
    { latitude: from.latitude, longitude: from.longitude },
    { latitude: to.latitude, longitude: to.longitude },
  );

const angleDiffDeg = (bearing1: number, bearing2: number): number => {
  let diff = bearing2 - bearing1;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  return diff;
};

/**
 * Turn-by-turn instructions for the outside-of-venue leg, generated from
 * bearing changes between real decision points (topology nodes) rather than
 * from every rendering-fidelity geometry point. Falls back gracefully to a
 * single "walk to gate" instruction for a 2-point beeline (no real turns to
 * describe). Road names are appended only when known (~1% of OSM ways in
 * this extract have one) — see docs/DATA_GIS_AND_FIELD_REQUIREMENTS.md — never
 * required for the instruction to make sense.
 */
export function generateStreetInstructions(
  topologyCoordinates: AppCoordinate[],
  hopDistancesM: number[],
  hopNames: Array<string | undefined>,
  gateLabel: { en: string; ur?: string; romanUrdu?: string },
): V2StreetNavigationInstruction[] {
  if (topologyCoordinates.length < 2 || hopDistancesM.length !== topologyCoordinates.length - 1) {
    return [];
  }

  const instructions: V2StreetNavigationInstruction[] = [];

  for (let i = 0; i < hopDistancesM.length; i += 1) {
    const from = topologyCoordinates[i];
    const to = topologyCoordinates[i + 1];
    const distanceM = Math.round(hopDistancesM[i]);
    const name = hopNames[i];
    const isFirstHop = i === 0;
    const isLastHop = i === hopDistancesM.length - 1;

    let maneuver: StreetManeuver = 'straight';
    if (!isFirstHop) {
      const previousBearing = bearing(topologyCoordinates[i - 1], from);
      const currentBearing = bearing(from, to);
      maneuver = classifyTurn(angleDiffDeg(previousBearing, currentBearing));
    }

    // Whole sentences per case (with and without a road name) so word order can differ per language.
    const sentence = (locale: Locale): string => {
      const gate = venueName(gateLabel, locale);
      if (isFirstHop) {
        return name
          ? tIn(locale, 'routeGuide.streetWalkOn', { distance: distanceM, road: name, gate })
          : tIn(locale, 'routeGuide.streetWalk', { distance: distanceM, gate });
      }
      if (maneuver === 'straight') {
        return name
          ? tIn(locale, 'routeGuide.streetContinueOn', { distance: distanceM, road: name })
          : tIn(locale, 'routeGuide.streetContinue', { distance: distanceM });
      }
      const turn = tIn(locale, MANEUVER_KEYS[maneuver]);
      return name
        ? tIn(locale, 'routeGuide.streetTurnOn', { maneuver: turn, road: name, distance: distanceM })
        : tIn(locale, 'routeGuide.streetTurn', { maneuver: turn, distance: distanceM });
    };

    const { text, urduText } = bothLocales((locale) =>
      isLastHop
        ? `${sentence(locale)} ${tIn(locale, 'routeGuide.streetArrive', { gate: venueName(gateLabel, locale) })}`
        : sentence(locale),
    );

    instructions.push({
      id: `v2-street-step-${i}`,
      text,
      urduText,
      distance: distanceM,
      distanceM,
      type: coarseType(maneuver),
      maneuver,
      coordinate: to,
      routeIndex: i,
      roadName: name,
    });
  }

  return instructions;
}
