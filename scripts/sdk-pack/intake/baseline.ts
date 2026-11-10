/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parsePackManifest, parsePackPlaceCatalog, parsePackVenueGeometry, type GeoPoint } from '../../../packages/offline-navigation/src/index';
import type { Baseline } from './importer';

/** The current approved data an intake is compared against: a compiled pack folder that carries venue-geometry and place-catalog. */
export const loadBaseline = (packDir: string): Baseline => {
  const manifestText = readFileSync(join(packDir, 'pack.manifest.json'), 'utf8');
  const m = parsePackManifest(manifestText);
  if (!m.ok) throw new Error(`the base pack manifest is not valid: ${m.error.message}`);
  const path = (kind: string) => m.manifest.resources.find((r) => r.kind === kind)?.path;
  const gp = path('venue-geometry'), cp = path('place-catalog');
  if (!gp || !cp) throw new Error('the base pack has no venue-geometry and place-catalog resources; rebuild it with the current tool first');
  const geo = parsePackVenueGeometry(readFileSync(join(packDir, gp), 'utf8'), { venueId: m.manifest.venueId, bounds: m.manifest.bounds });
  if (!geo.ok) throw new Error(`the base pack geometry is not valid: ${geo.error.message}`);
  const cat = parsePackPlaceCatalog(readFileSync(join(packDir, cp), 'utf8'), { venueId: m.manifest.venueId, bounds: m.manifest.bounds });
  if (!cat.ok) throw new Error(`the base pack catalog is not valid: ${cat.error.message}`);
  const gates = new Map<string, GeoPoint>();
  const catalogIds = new Map<string, { en: string }>();
  for (const p of cat.catalog.places) {
    catalogIds.set(p.id, { en: p.names.en });
    if (p.category === 'gate' && p.coordinate) gates.set(p.id, p.coordinate);
  }
  return {
    venueId: m.manifest.venueId, bounds: m.manifest.bounds, languages: m.manifest.languages, gates, catalogIds,
    blocks: geo.geometry.features.flatMap((f) => (f.shape === 'polygon' && f.role === 'block' && f.placeId ? [{ id: f.placeId, ring: f.ring, nodeIds: cat.catalog.byId.get(f.placeId)?.nodeIds ?? [] }] : [])),
  };
};
