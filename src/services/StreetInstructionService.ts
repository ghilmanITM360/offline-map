/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { getRhumbLineBearing } from 'geolib';
import { Coordinate as AppCoordinate, V2NavigationInstruction } from '../models/types';

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

const maneuverPhrase = (maneuver: StreetManeuver): { en: string; ur: string } => {
  switch (maneuver) {
    case 'slight_left': return { en: 'Bear left', ur: 'ہلکا بائیں مڑیں' };
    case 'slight_right': return { en: 'Bear right', ur: 'ہلکا دائیں مڑیں' };
    case 'left': return { en: 'Turn left', ur: 'بائیں مڑیں' };
    case 'right': return { en: 'Turn right', ur: 'دائیں مڑیں' };
    case 'sharp_left': return { en: 'Turn sharply left', ur: 'تیزی سے بائیں مڑیں' };
    case 'sharp_right': return { en: 'Turn sharply right', ur: 'تیزی سے دائیں مڑیں' };
    case 'u_turn': return { en: 'Make a U-turn', ur: 'یو ٹرن لیں' };
    default: return { en: 'Continue straight', ur: 'سیدھا جاری رکھیں' };
  }
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
 * this extract have one) — see docs/OSM_DATA_VALIDATION_REPORT.md — never
 * required for the instruction to make sense.
 */
export function generateStreetInstructions(
  topologyCoordinates: AppCoordinate[],
  hopDistancesM: number[],
  hopNames: Array<string | undefined>,
  gateLabel: string,
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

    const namePart = name ? ` on ${name}` : '';
    const nameUrPart = name ? ` ${name} پر` : '';

    let text: string;
    let urduText: string;

    if (isFirstHop) {
      text = `Walk ${distanceM}m${namePart} toward ${gateLabel}.`;
      urduText = `${gateLabel} کی طرف${nameUrPart} ${distanceM} میٹر چلیں۔`;
    } else if (maneuver === 'straight') {
      text = `Continue ${distanceM}m${namePart}.`;
      urduText = `${distanceM} میٹر${nameUrPart} سیدھا جاری رکھیں۔`;
    } else {
      const phrase = maneuverPhrase(maneuver);
      text = `${phrase.en}${namePart}, then continue ${distanceM}m.`;
      urduText = `${phrase.ur}${nameUrPart}، پھر ${distanceM} میٹر جاری رکھیں۔`;
    }

    if (isLastHop) {
      text = `${text} Arrive at ${gateLabel}.`;
      urduText = `${urduText} ${gateLabel} پہنچیں۔`;
    }

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
