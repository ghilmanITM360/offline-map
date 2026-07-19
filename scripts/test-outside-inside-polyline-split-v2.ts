import { strict as assert } from 'node:assert';
import { V2MapRenderingService } from '../src/services/V2MapRenderingService';

const coord = (n: number) => ({ latitude: n, longitude: n });

// No outside leg (undefined / 0): everything is "inside", nothing "outside".
{
  const coordinates = [coord(1), coord(2), coord(3)];
  const { outside, inside } = V2MapRenderingService.splitOutsideInsideCoordinates(coordinates, undefined);
  assert.deepEqual(outside, []);
  assert.deepEqual(inside, coordinates);
}
{
  const coordinates = [coord(1), coord(2), coord(3)];
  const { outside, inside } = V2MapRenderingService.splitOutsideInsideCoordinates(coordinates, 0);
  assert.deepEqual(outside, []);
  assert.deepEqual(inside, coordinates);
}

// Beeline outside leg (count=1): outside = [start, gate], inside = [gate, ...].
{
  const coordinates = [coord(1), coord(2), coord(3), coord(4)];
  const { outside, inside } = V2MapRenderingService.splitOutsideInsideCoordinates(coordinates, 1);
  assert.deepEqual(outside, [coord(1), coord(2)]);
  assert.deepEqual(inside, [coord(2), coord(3), coord(4)]);
  // Shared boundary point — the two polylines connect with no visual gap.
  assert.deepEqual(outside[outside.length - 1], inside[0]);
}

// Street-graph outside leg (count>1): same sharing behavior with more points.
{
  const coordinates = [coord(1), coord(2), coord(3), coord(4), coord(5), coord(6)];
  const { outside, inside } = V2MapRenderingService.splitOutsideInsideCoordinates(coordinates, 4);
  assert.deepEqual(outside, [coord(1), coord(2), coord(3), coord(4), coord(5)]);
  assert.deepEqual(inside, [coord(5), coord(6)]);
}

// Degenerate: count >= coordinates.length must not throw or produce an empty inside leg.
{
  const coordinates = [coord(1), coord(2)];
  const { outside, inside } = V2MapRenderingService.splitOutsideInsideCoordinates(coordinates, 5);
  assert.deepEqual(outside, []);
  assert.deepEqual(inside, coordinates);
}

console.log('test-outside-inside-polyline-split-v2.ts: all assertions passed');
