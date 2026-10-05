import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

// #140: markers, routes and shapes are MapLibre GeoJSON layers now, not per-object native map views. That removes the
// whole class of react-native-maps marker problems (view-snapshot re-rasterising via tracksViewChanges, the #268
// ConcurrentModificationException) by construction. What must stay true is that Home does not reintroduce native
// per-object views and keeps the scene memoized so GPS ticks do not rebuild every GeoJSON source.

const home = readFileSync('src/views/screens/HomeScreen.tsx', 'utf8');
const canvas = readFileSync('src/views/components/mapgl/OfflineMapCanvas.tsx', 'utf8');

assert(home.includes('buildMarkerOverlay('), 'Home must draw the user dot and pins through the shared marker overlay builder.');
assert(
  !/<(Marker|SvgMarker|Polyline|Polygon|Circle|UserLocationMarker)\b/.test(home),
  'Home must not mount per-object native map views: markers and shapes are GeoJSON layers.',
);
assert(home.includes('const mapOverlays = useMemo<OverlaySpec[]>('), 'The overlay scene must be memoized.');
assert(/<OverlayScene specs=\{overlays\} \/>/.test(canvas), 'The canvas must render overlays through the shared OverlayScene (stable source ids, diffed in place).');

console.log('Marker performance v2 checks passed.');
