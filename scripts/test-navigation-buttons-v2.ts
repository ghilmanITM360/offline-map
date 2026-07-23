import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

function getReturnObject(source: string): string {
  const returnStart = source.lastIndexOf('return {');
  assert(returnStart >= 0, 'View model return object must exist.');

  const returnEnd = source.indexOf('\n  };', returnStart);
  assert(returnEnd >= 0, 'View model return object must close cleanly.');

  return source.slice(returnStart, returnEnd);
}

// v2 live navigation now runs in-place on HomeScreen's persistent MapView — the buttons/banners
// that used to live in NavigationScreenV2 now live in NavigationChromeV2 (chrome/UI) and
// useNavigationOverlayV2 (stateful wiring), backed by the same NavigationViewModelV2. See
// docs/MAP_EXPERIENCE_AUDIT.md.
const navigationChromeSource = readFileSync('src/views/components/navigation/NavigationChromeV2.tsx', 'utf8');
const navigationOverlaySource = readFileSync('src/viewmodels/useNavigationOverlayV2.ts', 'utf8');
const navigationViewModelSource = readFileSync('src/viewmodels/NavigationViewModelV2.ts', 'utf8');

const navigationVmReturnSource = getReturnObject(navigationViewModelSource);

assert(
  navigationOverlaySource.includes('useNavigationViewModelV2()'),
  'v2 navigation overlay must stay wired to v2 navigation view model.',
);
assert(
  navigationOverlaySource.includes('BackHandler.addEventListener(\'hardwareBackPress\''),
  'Navigation v2 Android back handler must stay registered.',
);
assert(
  navigationOverlaySource.includes('onPress: () => vm.handleExit()'),
  'Navigation v2 Android back confirm must exit through shared handler.',
);
assert(
  navigationChromeSource.includes('style={styles.exitButton}') && navigationChromeSource.includes('onPress={() => handleExit()}'),
  'Navigation v2 Exit button must stay wired to shared exit handler.',
);
assert(
  navigationChromeSource.includes('testID="nav-arrived-done-button"') &&
    navigationChromeSource.includes('style={styles.arrivedButton}') &&
    navigationChromeSource.includes('onPress={() => handleExit()}'),
  'Navigation v2 arrival Done button must stay wired to shared exit handler.',
);
assert(
  navigationChromeSource.includes('testID="nav-recenter-button"') && navigationChromeSource.includes('styles.recenterButton'),
  'Navigation v2 recenter control must stay rendered while navigating.',
);
assert(
  navigationChromeSource.includes('onPress={() => setIsAutoFollowing(true)}'),
  'Navigation v2 recenter control must resume auto-follow.',
);
assert(
  navigationChromeSource.includes('testID="nav-arrived-recenter-button"') &&
    navigationChromeSource.includes('testID="nav-arrived-done-button"'),
  'Navigation v2 arrival sheet must offer both Recenter map and Done actions.',
);
assert(
  // v2 speech now goes through the shared VoiceService (queued/deduped) instead of calling
  // expo-speech raw — see src/services/VoiceService.ts speakInstruction()/stopSpeaking().
  navigationViewModelSource.includes('VoiceService.speakInstruction(') && navigationViewModelSource.includes('VoiceService.stopSpeaking()'),
  'Navigation v2 view model must speak/stop through the shared VoiceService.',
);
assert(
  // Camera recenter now goes through CameraManager.enterNavigationCamera() (see
  // src/viewmodels/useCameraManager.ts) instead of calling mapRef.animateCamera directly.
  navigationOverlaySource.includes('cameraManager.enterNavigationCamera(snappedLocation') &&
    navigationOverlaySource.includes('heading: settings.keepNorthFixed ? 0 : (snappedLocation.heading ?? 0)'),
  'Navigation v2 auto-follow effect must keep camera recenter on the snapped location.',
);
assert(
  navigationChromeSource.includes('{isWeakGps && (') &&
    navigationChromeSource.includes('Weak GPS signal detected. Route updates may be slower.'),
  'Navigation v2 weak GPS banner must stay visible from view model state.',
);
assert(
  navigationChromeSource.includes('{rerouteStatusMessage && !reroutePending && (') &&
    navigationChromeSource.includes('<Text style={styles.rerouteHintText}>{rerouteStatusMessage}</Text>'),
  'Navigation v2 reroute status message must stay rendered when reroute settles.',
);
assert(
  navigationChromeSource.includes('{reroutePending ? (') &&
    navigationChromeSource.includes('<Text style={styles.rerouteText}>Recalculating...</Text>'),
  'Navigation v2 reroute pending state must stay visible.',
);

for (const field of ['reroutePending', 'isWeakGps', 'rerouteStatusMessage', 'handleExit']) {
  assert(
    navigationChromeSource.includes(`${field},`),
    `NavigationChromeV2 must destructure ${field} from the overlay.`,
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
  navigationViewModelSource.includes('VoiceService.stopSpeaking();') && navigationViewModelSource.includes('stopNavigation();'),
  'Navigation v2 exit handler must stop speech and clear navigation state.',
);
assert(
  !navigationViewModelSource.includes('navigation.reset('),
  'Navigation v2 exit handler must not reset the navigation stack — v2 nav runs on the persistent Home map, so exiting just clears state instead of destroying and remounting it.',
);

console.log('Navigation buttons v2 checks passed.');
