import { strict as assert } from 'node:assert';
import { SpatialGrid, haversineM } from '../src/utils/SpatialGrid';

// Empty grid
{
  const grid = new SpatialGrid([]);
  assert.equal(grid.nearest(24.97, 67.0), undefined);
}

// Single point always wins
{
  const grid = new SpatialGrid([{ id: 'a', lat: 24.97, lng: 67.0 }]);
  const result = grid.nearest(24.9701, 67.0001);
  assert.equal(result?.point.id, 'a');
}

// Brute-force cross-check over a random point cloud around Karachi Ijtema,
// at realistic street-graph density (~14k points, same order as the real
// OSM extract validated in docs/OSM_DATA_VALIDATION_REPORT.md).
{
  const centerLat = 24.971698;
  const centerLng = 67.006464;
  const n = 5000;
  const points: Array<{ id: string; lat: number; lng: number }> = [];
  for (let i = 0; i < n; i += 1) {
    // spread roughly within a 3km box
    const lat = centerLat + (Math.random() - 0.5) * 0.054; // ~3km in degrees lat
    const lng = centerLng + (Math.random() - 0.5) * 0.06; // ~3km in degrees lng at this latitude
    points.push({ id: `p${i}`, lat, lng });
  }

  const grid = new SpatialGrid(points, 150);

  const bruteForceNearest = (lat: number, lng: number) => {
    let best: { id: string; distanceM: number } | undefined;
    for (const point of points) {
      const distanceM = haversineM(lat, lng, point.lat, point.lng);
      if (!best || distanceM < best.distanceM) best = { id: point.id, distanceM };
    }
    return best!;
  };

  const queries = 200;
  for (let i = 0; i < queries; i += 1) {
    const lat = centerLat + (Math.random() - 0.5) * 0.07;
    const lng = centerLng + (Math.random() - 0.5) * 0.07;

    const gridResult = grid.nearest(lat, lng);
    const bruteResult = bruteForceNearest(lat, lng);

    assert.ok(gridResult, `grid.nearest returned undefined for query ${i}`);
    // Compare distances (not ids) — ties between equidistant points are fine,
    // but the grid must never return something farther than the true nearest.
    assert.ok(
      Math.abs(gridResult!.distanceM - bruteResult.distanceM) < 1e-6,
      `query ${i}: grid found ${gridResult!.distanceM}m, brute-force found ${bruteResult.distanceM}m`,
    );
  }
}

console.log('test-spatial-grid.ts: all assertions passed');
