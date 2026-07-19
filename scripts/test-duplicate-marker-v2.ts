import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const home = readFileSync('src/views/screens/HomeScreen.tsx', 'utf8');

assert(
  home.includes('showsUserLocation={false}'),
  'Home must not render native user location when custom current marker is rendered.',
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
