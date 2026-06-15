import { V2PlaceAdapter } from '../src/services/V2PlaceAdapter';

process.env.EXPO_PUBLIC_USE_IJTEMA_V2_MAP = 'true';
process.env.EXPO_PUBLIC_USE_IJTEMA_V2_ROUTING = 'true';

const parkingPlaces = V2PlaceAdapter.getPlacesByCategory('parking');

if (parkingPlaces.length === 0) {
  console.log('Parking data missing / not implemented');
  process.exit(0);
}

console.log(`Parking routing placeholders found: ${parkingPlaces.length}`);
