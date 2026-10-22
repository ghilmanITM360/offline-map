import * as venue from '../../packages/offline-navigation/src/domain/venue';
import * as street from '../../packages/offline-navigation/src/domain/street';
import * as sdk from '@muslim-ummah/offline-navigation';
import * as location from '../../packages/offline-navigation/src/domain/journey/LocationCapability';
import * as start from '../../packages/offline-navigation/src/domain/journey/NavigationStartPolicy';
import * as destination from '../../packages/offline-navigation/src/domain/journey/DestinationJourneyPolicy';
import * as presentation from '../../packages/offline-navigation/src/domain/journey/JourneyPresentationState';
import * as facade from '../services/JourneyPresentationState';

it('root forwards every journey, venue and street runtime binding unchanged', () => {
  const api = sdk as Record<string, unknown>;
  for (const domain of [location, start, destination, presentation, venue, street]) {
    for (const [name, value] of Object.entries(domain)) expect(api[name]).toBe(value);
  }
  expect(Object.keys(facade).sort()).toEqual(Object.keys(presentation).sort());
  for (const name of Object.keys(presentation)) {
    expect((facade as Record<string, unknown>)[name]).toBe(api[name]);
  }
});
