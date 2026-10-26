import { mkdirSync, mkdtempSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createExpoPackFileSystem } from './expoPackFileSystem';
import { createFakeExpoFs } from './fakeExpoFs';
import { runPackSelfTest } from './packSelfTest';
import { buildPack, directoryCopier } from './testPacks';

// The same scenarios the app runs on the device, run here against the test double. A scenario that passes here and fails on a device
// means the double disagrees with the platform: that is exactly what the on-device run exists to find.
let work: string;
beforeEach(() => { work = mkdtempSync(join(tmpdir(), 'pack-selftest-')); });
afterEach(() => { rmSync(work, { recursive: true, force: true }); });

const dependencies = async () => {
  const app = join(work, 'app');
  const root = join(work, 'root');
  mkdirSync(app);
  mkdirSync(root);
  const fake = createFakeExpoFs();
  const primary = await buildPack(app, 'venue-a');
  const secondary = await buildPack(app, 'venue-b');
  return {
    fake,
    deps: {
      fs: createExpoPackFileSystem(`file://${root}`, fake.api),
      reset: async () => { rmSync(root, { recursive: true, force: true }); mkdirSync(root); },
      copier: directoryCopier(app, root),
      primary: { id: primary.id, venueId: 'venue-a', manifestSha256: primary.sha, files: primary.files },
      secondary: { id: secondary.id, venueId: 'venue-b', manifestSha256: secondary.sha, files: secondary.files },
      sdkVersion: '0.1.0', platformCapabilities: ['pmtiles-local-read'],
      moveFile: (from: string, to: string) => { mkdirSync(dirname(join(root, to)), { recursive: true }); renameSync(join(root, from), join(root, to)); },
    },
  };
};

it('every self-test scenario passes, and no file handle is left open', async () => {
  const { deps, fake } = await dependencies();
  const results = await runPackSelfTest(deps);
  expect(results.filter((r) => !r.ok)).toEqual([]);
  expect(results.length).toBeGreaterThanOrEqual(9);
  expect(fake.openHandles()).toBe(0);
});
