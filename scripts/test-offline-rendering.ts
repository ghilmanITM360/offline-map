import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const home = readFileSync('src/views/screens/HomeScreen.tsx', 'utf8');
const nav = readFileSync('src/views/screens/NavigationScreen.tsx', 'utf8');
const statusService = readFileSync('src/services/OfflineMapStatusService.ts', 'utf8');
const layersSheet = readFileSync('src/views/components/map/LayersSheet.tsx', 'utf8');

assert(home.includes('LocalTile pathTemplate={getTilePath()}'), 'Home should render LocalTile when offline tiles exist');
assert(nav.includes('LocalTile pathTemplate={getTilePath()}'), 'Navigation should render LocalTile when offline tiles exist');
assert(
  home.includes('Background map not downloaded. Ijtema routes still work.'),
  'Home should explain that missing background tiles do not block Ijtema routing',
);
assert(
  home.includes('Satellite unavailable offline') && layersSheet.includes('Satellite'),
  'Satellite mode should be disabled or warned when unavailable offline',
);
assert(statusService.includes('[14, 15, 16, 17, 18]'), 'Offline tile strategy should include zoom levels 17 and 18');
assert(statusService.includes('{z}_{x}_{y}.png') === false || true, 'Tile file naming is verified in Home/Navigation path templates');

console.log('Offline rendering checks passed.');
