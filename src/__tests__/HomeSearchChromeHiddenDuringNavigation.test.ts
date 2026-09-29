import { readFileSync } from 'fs';
import { join } from 'path';

// deriveMapMode ranks ARRIVAL above NAVIGATION, and both render the navigation chrome. The
// Home search bar/chips were gated on NAVIGATION only, so they drew over the maneuver banner
// once the arrival signal fired while the banner was still up.
test('Home search bar/chips are hidden in both NAVIGATION and ARRIVAL modes', () => {
  const src = readFileSync(join(__dirname, '../views/screens/HomeScreen.tsx'), 'utf8');
  const anchor = src.indexOf('style={styles.topOverlay}');
  expect(anchor).toBeGreaterThan(-1);
  const gate = src.slice(src.lastIndexOf('{mode !==', anchor), anchor);
  expect(gate).toContain("mode !== 'NAVIGATION'");
  expect(gate).toContain("mode !== 'ARRIVAL'");
});
