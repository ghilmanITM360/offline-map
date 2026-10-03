import { readFileSync } from 'fs';
import { join } from 'path';

test('navigation chrome does not bypass the V2 place data adapter', () => {
  const source = readFileSync(join(__dirname, '../views/components/navigation/NavigationChromeV2.tsx'), 'utf8');
  expect(source).not.toMatch(/\bIJTEMA_GATES\b/);
});

test('location sheet does not bypass the V2 place data adapter', () => {
  const source = readFileSync(join(__dirname, '../views/components/map/LocationSheet.tsx'), 'utf8');
  expect(source).not.toMatch(/\bIJTEMA_GATES\b/);
});
