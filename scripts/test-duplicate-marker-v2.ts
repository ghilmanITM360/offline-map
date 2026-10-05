import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const home = readFileSync('src/views/screens/HomeScreen.tsx', 'utf8');

// MapLibre has no `showsUserLocation` prop; the guard is that Home never mounts the library's own user-location
// puck, so the app-owned user dot (markers-user source) is the only current-location marker.
assert(
  !/\b(NativeUserLocation|UserLocation|UserLocationPuck)\b/.test(home),
  'Home must not render the native user location puck when the custom current marker is rendered.',
);
assert(
  !home.includes("activePreviewRoute.startResolution?.mode === 'outside' || !currentLocation"),
  'Route preview must not render separate start marker for current-GPS outside route.',
);
assert(
  /routePlannerOrigin\s*&&\s*previewStartCoordinate/.test(home),
  'Preview start marker should render only for manual routePlannerOrigin.',
);

console.log('Duplicate marker v2 checks passed.');
