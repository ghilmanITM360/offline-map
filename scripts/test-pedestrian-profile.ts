import assert from 'node:assert/strict';

import { evaluatePedestrianWay } from './pedestrianProfile';

interface Fixture {
  name: string;
  tags: Record<string, string>;
  include: boolean;
  direction: 'both' | 'forward' | 'reverse' | 'none';
  reason: string;
}

const fixtures: Fixture[] = [
  { name: 'residential normal road', tags: { highway: 'residential', sidewalk: 'both' }, include: true, direction: 'both', reason: 'walkable-road-sidewalk' },
  { name: 'road with no sidewalk', tags: { highway: 'residential', sidewalk: 'no' }, include: true, direction: 'both', reason: 'walkable-road-no-sidewalk' },
  { name: 'road with one absent sidewalk side', tags: { highway: 'residential', 'sidewalk:left': 'no' }, include: true, direction: 'both', reason: 'walkable-road' },
  { name: 'road with separately mapped sidewalk', tags: { highway: 'residential', sidewalk: 'separate' }, include: true, direction: 'both', reason: 'walkable-road-separate-sidewalk' },
  { name: 'foot=no', tags: { highway: 'residential', foot: 'no' }, include: false, direction: 'none', reason: 'foot-no' },
  { name: 'access=no', tags: { highway: 'residential', access: 'no' }, include: false, direction: 'none', reason: 'access-no' },
  { name: 'access=private', tags: { highway: 'service', access: 'private' }, include: false, direction: 'none', reason: 'access-private' },
  { name: 'foot=yes override', tags: { highway: 'service', access: 'private', foot: 'yes' }, include: true, direction: 'both', reason: 'explicit-foot-override' },
  { name: 'foot=permissive override', tags: { highway: 'service', access: 'private', foot: 'permissive' }, include: true, direction: 'both', reason: 'explicit-foot-override' },
  { name: 'access=destination through-route restriction', tags: { highway: 'service', access: 'destination' }, include: false, direction: 'none', reason: 'access-destination' },
  { name: 'access=customers through-route restriction', tags: { highway: 'service', access: 'customers' }, include: false, direction: 'none', reason: 'access-customers' },
  { name: 'foot=destination through-route restriction', tags: { highway: 'service', foot: 'destination' }, include: false, direction: 'none', reason: 'foot-destination' },
  { name: 'foot=use_sidepath', tags: { highway: 'residential', foot: 'use_sidepath' }, include: false, direction: 'none', reason: 'foot-use-sidepath' },
  { name: 'permissive access', tags: { highway: 'service', access: 'permissive' }, include: true, direction: 'both', reason: 'walkable-service' },
  { name: 'pedestrian street', tags: { highway: 'pedestrian' }, include: true, direction: 'both', reason: 'pedestrian-way' },
  { name: 'footway', tags: { highway: 'footway' }, include: true, direction: 'both', reason: 'pedestrian-way' },
  { name: 'path', tags: { highway: 'path' }, include: true, direction: 'both', reason: 'pedestrian-way' },
  { name: 'steps', tags: { highway: 'steps' }, include: true, direction: 'both', reason: 'pedestrian-way' },
  { name: 'gated barrier', tags: { highway: 'service', barrier: 'gate' }, include: false, direction: 'none', reason: 'barrier-gate-unverified' },
  { name: 'gated barrier explicitly walkable', tags: { highway: 'service', barrier: 'gate', foot: 'yes' }, include: true, direction: 'both', reason: 'explicit-foot-override' },
  { name: 'fence barrier', tags: { highway: 'path', barrier: 'fence' }, include: false, direction: 'none', reason: 'barrier-blocking' },
  { name: 'legal crossing', tags: { highway: 'footway', footway: 'crossing', crossing: 'marked' }, include: true, direction: 'both', reason: 'legal-crossing' },
  { name: 'service road', tags: { highway: 'service' }, include: true, direction: 'both', reason: 'walkable-service' },
  { name: 'track', tags: { highway: 'track' }, include: true, direction: 'both', reason: 'walkable-track' },
  { name: 'construction', tags: { highway: 'construction' }, include: false, direction: 'none', reason: 'inactive-highway' },
  { name: 'construction lifecycle tag', tags: { highway: 'residential', construction: 'yes' }, include: false, direction: 'none', reason: 'inactive-highway' },
  { name: 'proposed', tags: { highway: 'proposed' }, include: false, direction: 'none', reason: 'inactive-highway' },
  { name: 'proposed lifecycle tag', tags: { highway: 'residential', proposed: 'yes' }, include: false, direction: 'none', reason: 'inactive-highway' },
  { name: 'disused lifecycle', tags: { highway: 'residential', disused: 'yes' }, include: false, direction: 'none', reason: 'inactive-highway' },
  { name: 'motor oneway pedestrian exception', tags: { highway: 'residential', oneway: 'yes' }, include: true, direction: 'both', reason: 'walkable-road' },
  { name: 'explicit oneway:foot forward', tags: { highway: 'path', 'oneway:foot': 'yes' }, include: true, direction: 'forward', reason: 'pedestrian-way' },
  { name: 'explicit oneway:foot reverse', tags: { highway: 'path', 'oneway:foot': '-1' }, include: true, direction: 'reverse', reason: 'pedestrian-way' },
  { name: 'explicit oneway:foot exception', tags: { highway: 'path', oneway: 'yes', 'oneway:foot': 'no' }, include: true, direction: 'both', reason: 'pedestrian-way' },
];

for (const fixture of fixtures) {
  const actual = evaluatePedestrianWay(fixture.tags);
  assert.equal(actual.include, fixture.include, `${fixture.name} include`);
  assert.equal(actual.direction, fixture.direction, `${fixture.name} direction`);
  assert.equal(actual.reason, fixture.reason, `${fixture.name} reason`);
  console.log(`${fixture.name}: ${actual.include ? 'INCLUDE' : 'EXCLUDE'} ${actual.direction} ${actual.reason}`);
}

console.log(`Pedestrian profile checks passed: ${fixtures.length} fixtures.`);
