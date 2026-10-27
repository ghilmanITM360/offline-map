import { useAccessibilityFocus as hostFocus } from '../views/hooks/useAccessibilityFocus';
import * as publicUI from '@muslim-ummah/offline-navigation/ui';
import * as leaf0 from '../../packages/offline-navigation/src/ui/MapUnavailableBanner';
import * as leaf1 from '../../packages/offline-navigation/src/ui/ArrivalCard';
import * as leaf2 from '../../packages/offline-navigation/src/ui/EntryGateOriginBanner';
import * as leaf3 from '../../packages/offline-navigation/src/ui/ActiveDirectionsPanel';
import * as leaf4 from '../../packages/offline-navigation/src/ui/GpsSignalBanner';
import * as leaf5 from '../../packages/offline-navigation/src/ui/RouteEndpointRows';
import * as leaf6 from '../../packages/offline-navigation/src/ui/StartOptionCard';
import * as leaf7 from '../../packages/offline-navigation/src/ui/DirectionsHeader';
import * as leaf8 from '../../packages/offline-navigation/src/ui/RerouteProgressCard';
import * as leaf9 from '../../packages/offline-navigation/src/ui/RouteGuideCard';
import * as leaf10 from '../../packages/offline-navigation/src/ui/GateChooser';
import * as leaf11 from '../../packages/offline-navigation/src/ui/ManualLiveUpgradeCard';
import * as leaf12 from '../../packages/offline-navigation/src/ui/RerouteBanner';
import * as leaf13 from '../../packages/offline-navigation/src/ui/useAccessibilityFocus';
import * as leaf14 from '../../packages/offline-navigation/src/ui/Text';
import * as leaf15 from '../../packages/offline-navigation/src/ui/NavigationProvider';
import * as leaf16 from '../../packages/offline-navigation/src/ui/RouteStepCopy';
import * as leaf17 from '../../packages/offline-navigation/src/ui/NavigationScreen';
import * as leaf18 from '../../packages/offline-navigation/src/ui/PlaceDirectory';
import * as leaf19 from '../../packages/offline-navigation/src/ui/createDefaultNavigationTheme';
import * as leaf20 from '../../packages/offline-navigation/src/ui/EnglishNavigationCopy';
import * as leaf21 from '../../packages/offline-navigation/src/ui/useSafetyAnnouncements';

it('public UI forwards all leaf and hook references without adding runtime bindings', () => {
  expect(hostFocus).toBe(publicUI.useAccessibilityFocus);
  const api = publicUI as Record<string, unknown>;
  const leaves = [leaf0,leaf1,leaf2,leaf3,leaf4,leaf5,leaf6,leaf7,leaf8,leaf9,leaf10,leaf11,leaf12,leaf13,leaf14,leaf15,leaf16,leaf17,leaf18,leaf19,leaf20,leaf21];
  const names = new Set<string>();
  for (const leaf of leaves) for (const [name, value] of Object.entries(leaf)) {
    names.add(name);
    expect(api[name]).toBe(value);
  }
  expect(Object.keys(api).sort()).toEqual([...names].sort());
});
