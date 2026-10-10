import { restoreDirectoryOffset } from '../utils/directoryScrollRestoration';
test('resolves stable item against current geometry, not old pixel offset', () => {
  expect(restoreDirectoryOffset({ id: 'B28', delta: 12 }, { B28: 500 }, 1000, 300)).toBe(512);
});
test('clamps when content shrinks and resets when anchor disappears', () => {
  expect(restoreDirectoryOffset({ id: 'B28', delta: 12 }, { B28: 500 }, 600, 300)).toBe(300);
  expect(restoreDirectoryOffset({ id: 'B28', delta: 12 }, {}, 600, 300)).toBe(0);
});
