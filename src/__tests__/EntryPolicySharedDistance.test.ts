import { readFileSync } from 'fs';
import { join } from 'path';
import { findNearestOfficialEntryGate, getRoutableOfficialGates } from '../data/ijtema/entryPolicy';
import { distanceMeters } from '../data/ijtema/graphBuilder';

describe('official entry distance ownership', () => {
  it('uses the shared graph distance function rather than a second implementation', () => {
    const source = readFileSync(join(__dirname, '../data/ijtema/entryPolicy.ts'), 'utf8');
    expect(source).toMatch(/import\s*\{\s*distanceMeters\s*\}\s*from\s*['"]\.\/graphBuilder['"]/);
    expect(source).not.toMatch(/const\s+(distanceMeters|degreesToRadians)\s*=/);
  });

  it.each([
    { lat: 24.963718, lng: 67.006862 },
    { lat: 24.9762, lng: 67.0089 },
    { lat: 24.9696, lng: 66.9975 },
  ])('retains nearest routable gate for %o', coordinate => {
    const gates = getRoutableOfficialGates();
    const expected = gates.reduce((nearest, gate) =>
      distanceMeters(coordinate, gate.coordinate!) < distanceMeters(coordinate, nearest.coordinate!) ? gate : nearest);
    expect(findNearestOfficialEntryGate(coordinate)?.id).toBe(expected.id);
  });
});
