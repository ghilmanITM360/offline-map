import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

// Regression for "Change Destination" doesn't change destination: tapping the link used
// to unconditionally call onClose (exiting route preview entirely) instead of letting the
// rider pick a new destination in place — see docs/fix.md Fix 1. The fix reuses the exact
// same in-sheet search pattern "Change Start" already established (SearchService.search,
// no full-screen search overlay), adapted to the destination side, and reuses the same
// directionsDestination state HomeScreen already writes on the very first "Directions" tap
// so useDirectionsViewModel recalculates the route with no new recalculation path.
const locationSheet = readFileSync('src/views/components/map/LocationSheet.tsx', 'utf8');
const homeScreen = readFileSync('src/views/screens/HomeScreen.tsx', 'utf8');

assert(
  locationSheet.includes('onChangeDestination?: (place: Place) => void;'),
  'LocationSheetProps (routePreview mode) must accept an onChangeDestination callback.',
);
assert(
  locationSheet.includes('onChangeDestination={props.onChangeDestination}'),
  'LocationSheet must forward onChangeDestination into RoutePreviewSection.',
);
assert(
  /const \[showDestinationOptions, setShowDestinationOptions\] = useState\(false\);/.test(locationSheet),
  'RoutePreviewSection must track whether the inline destination search is open.',
);
assert(
  /const destCandidates = useMemo\(\(\) => \{\s*\n\s*if \(!showDestinationOptions \|\| destSearch\.trim\(\)\.length < 2\) return \[\];\s*\n\s*return SearchService\.search\(destSearch, currentLocation \?\? undefined\)/.test(locationSheet),
  'Destination candidates must reuse SearchService.search — the same underlying mechanism "Change Start" already uses for manual start candidates, not a new search path.',
);
assert(
  !/onPress=\{onClose\}\s*\n\s*accessibilityRole="button"\s*\n\s*accessibilityLabel="Change destination"/.test(locationSheet),
  '"Change destination" must no longer unconditionally call onClose — it must open the inline destination search when onChangeDestination is provided.',
);
assert(
  locationSheet.includes('onPress={onChangeDestination ? () => setShowDestinationOptions(true) : onClose}'),
  '"Change destination" must open the inline search via onChangeDestination, falling back to onClose only when no handler is supplied.',
);
assert(
  locationSheet.includes('onChangeDestination?.(candidate);'),
  'Selecting a destination search result must call onChangeDestination with the picked place.',
);

// HomeScreen wiring: reuses setDirectionsDestination (the same state handleOpenDirections
// already writes) instead of inventing a second destination-selection path, and the sheet
// itself must be passed the handler.
const changeDestinationHeaderMatch = homeScreen.match(
  /const handleChangeDestination = useCallback\(\(place: Place\) => \{[\s\S]*?\}, \[[^\]]*\]\);/,
);
assert(changeDestinationHeaderMatch, 'Could not locate handleChangeDestination in HomeScreen.tsx.');
assert(
  /setDirectionsDestination\(place\);/.test(changeDestinationHeaderMatch![0]),
  'HomeScreen.handleChangeDestination must reuse setDirectionsDestination — the same state handleOpenDirections already writes — not a new destination-selection mechanism.',
);
assert(
  homeScreen.includes('onChangeDestination={handleChangeDestination}'),
  'HomeScreen must wire handleChangeDestination into the routePreview LocationSheet.',
);

// CameraManager sole-ownership invariant: handleChangeDestination itself must not call the
// camera directly — camera follow for v2 destinations already happens via the existing
// activePreviewRoute -> cameraManager.fitRoute() effect once DirectionsViewModel's route
// recalculation lands in the store.
assert(
  !/cameraManager\.|animateToRegion|animateCamera|setCamera/.test(changeDestinationHeaderMatch![0]),
  'handleChangeDestination must not call the camera directly — CameraManager is the sole owner of camera movement, and the existing activePreviewRoute effect already re-fits the route.',
);

console.log('Change Destination v2 checks passed.');
