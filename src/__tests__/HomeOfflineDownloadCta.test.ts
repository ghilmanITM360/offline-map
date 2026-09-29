import { readFileSync } from 'fs';
import { join } from 'path';

// The Home "Download background map" button opens the Download Map screen, which says the
// download is unavailable in release builds. The button must follow the same flag.
test('Home offline download CTA is gated on OfflineMapService.isOfflineTileDownloadAvailable()', () => {
  const src = readFileSync(join(__dirname, '../views/screens/HomeScreen.tsx'), 'utf8');
  const cta = src.indexOf('accessibilityLabel="Download background map"');
  expect(cta).toBeGreaterThan(-1);
  expect(src.lastIndexOf('OfflineMapService.isOfflineTileDownloadAvailable()', cta)).toBeGreaterThan(cta - 400);
});
