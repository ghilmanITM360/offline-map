/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '..', '..');
const trackerPath = path.join(
  root,
  'node_modules/react-native-maps/android/src/main/java/com/rnmaps/maps/ViewChangesTracker.java',
);

// #268: react-native-maps' ViewChangesTracker.update() iterates a plain LinkedList of markers and
// calls into each marker. A marker added or removed while that loop runs throws a
// ConcurrentModificationException on the main thread and kills the app (seen once at Start
// Navigation). Upstream has the same code on master, so the app carries a one-line patch that
// iterates a snapshot. These checks fail if the patch stops being applied.
describe('react-native-maps ViewChangesTracker is patched to iterate a snapshot (#268)', () => {
  it('the installed tracker does not iterate the live marker list', () => {
    const source = fs.readFileSync(trackerPath, 'utf8');
    expect(source).not.toMatch(/for\s*\(\s*MapMarker\s+\w+\s*:\s*markers\s*\)/);
    expect(source).toMatch(/for\s*\(\s*MapMarker\s+\w+\s*:\s*new\s+ArrayList<>\(markers\)\s*\)/);
  });

  it('the patch is committed and applied on install', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    expect(pkg.scripts.postinstall).toBe('patch-package');
    expect(pkg.devDependencies['patch-package']).toBeDefined();

    const installed = JSON.parse(
      fs.readFileSync(path.join(root, 'node_modules/react-native-maps/package.json'), 'utf8'),
    ).version;
    expect(fs.existsSync(path.join(root, 'patches', `react-native-maps+${installed}.patch`))).toBe(true);
  });
});
