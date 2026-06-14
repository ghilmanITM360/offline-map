import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

function getSection(source: string, startToken: string, endToken: string): string {
  const start = source.indexOf(startToken);
  assert(start >= 0, `Missing section start: ${startToken}`);

  const end = source.indexOf(endToken, start);
  assert(end >= 0, `Missing section end: ${endToken}`);

  return source.slice(start, end);
}

function getReturnObject(source: string): string {
  const returnStart = source.lastIndexOf('return {');
  assert(returnStart >= 0, 'View model return object must exist.');

  const returnEnd = source.indexOf('\n  };', returnStart);
  assert(returnEnd >= 0, 'View model return object must close cleanly.');

  return source.slice(returnStart, returnEnd);
}

const navigationScreenSource = readFileSync('src/views/screens/NavigationScreen.tsx', 'utf8');
const navigationViewModelSource = readFileSync('src/viewmodels/NavigationViewModelV2.ts', 'utf8');

const navigationScreenV2Source = getSection(
  navigationScreenSource,
  'function NavigationScreenV2() {',
  '\nconst styles = StyleSheet.create({',
);

const navigationVmReturnSource = getReturnObject(navigationViewModelSource);

assert(
  navigationScreenV2Source.includes('useNavigationViewModelV2()'),
  'Navigation v2 screen must stay wired to v2 navigation view model.',
);
assert(
  navigationScreenV2Source.includes('BackHandler.addEventListener(\'hardwareBackPress\''),
  'Navigation v2 Android back handler must stay registered.',
);
assert(
  navigationScreenV2Source.includes('onPress: () => handleExit(nav)'),
  'Navigation v2 Android back confirm must exit through shared handler.',
);
assert(
  navigationScreenV2Source.includes('<Pressable style={styles.exitButton} onPress={() => handleExit(nav)}>'),
  'Navigation v2 Exit button must stay wired to shared exit handler.',
);
assert(
  navigationScreenV2Source.includes('<Pressable style={styles.arrivedButton} onPress={() => handleExit(nav)}>'),
  'Navigation v2 arrival Done button must stay wired to shared exit handler.',
);
assert(
  navigationScreenV2Source.includes('style={[styles.recenterButton, { bottom: Math.max(insets.bottom, 12) + 140 }]}'),
  'Navigation v2 recenter control must stay rendered while navigating.',
);
assert(
  navigationScreenV2Source.includes('setIsAutoFollowing(true);') &&
    navigationScreenV2Source.includes('center: snappedLocation') &&
    navigationScreenV2Source.includes('heading: settings.keepNorthFixed ? 0 : (snappedLocation.heading ?? 0)'),
  'Navigation v2 recenter control must resume auto-follow and camera recenter.',
);
assert(
  navigationScreenV2Source.includes('{isWeakGps && (') &&
    navigationScreenV2Source.includes('Weak GPS signal detected. Route updates may be slower.'),
  'Navigation v2 weak GPS banner must stay visible from view model state.',
);
assert(
  navigationScreenV2Source.includes('{rerouteStatusMessage && !reroutePending && (') &&
    navigationScreenV2Source.includes('<Text style={styles.rerouteHintText}>{rerouteStatusMessage}</Text>'),
  'Navigation v2 reroute status message must stay rendered when reroute settles.',
);
assert(
  navigationScreenV2Source.includes('{reroutePending ? (') &&
    navigationScreenV2Source.includes('<Text style={styles.rerouteText}>Recalculating...</Text>'),
  'Navigation v2 reroute pending state must stay visible.',
);

for (const field of ['reroutePending', 'isWeakGps', 'rerouteStatusMessage', 'handleExit']) {
  assert(
    navigationScreenV2Source.includes(`${field},`),
    `Navigation v2 screen must keep ${field} from view model.`,
  );
  assert(
    navigationVmReturnSource.includes(`${field},`),
    `Navigation v2 view model must return ${field}.`,
  );
}

assert(
  navigationViewModelSource.includes('setRerouteStatusMessage(failure.message);'),
  'Navigation v2 view model must keep reroute failure status wiring.',
);
assert(
  navigationViewModelSource.includes('setIsWeakGps(true);') &&
    navigationViewModelSource.includes('setIsWeakGps(weakGps);'),
  'Navigation v2 view model must keep weak GPS state updates.',
);
assert(
  navigationViewModelSource.includes('navigation.reset({ index: 0, routes: [{ name: \'Main\' }] });'),
  'Navigation v2 exit handler must still reset back to main flow.',
);

console.log('Navigation buttons v2 checks passed.');
