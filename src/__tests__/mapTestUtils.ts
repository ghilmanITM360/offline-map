import { act, screen } from '@testing-library/react-native';

// Helpers for asserting on the MapLibre scene under the Jest stand-ins (see jest.setup.ts): every
// GeoJSON source mounts as a `source-<id>` View carrying its `data`, so tests read what the map would draw.

const mapEl = () => screen.getByTestId('home-map-view', { includeHiddenElements: true });

export const sourceFeatures = (id: string): GeoJSON.Feature[] =>
  (screen.queryByTestId(`source-${id}`, { includeHiddenElements: true })?.props.data?.features as GeoJSON.Feature[] | undefined) ?? [];

export const hasSource = (id: string) => !!screen.queryByTestId(`source-${id}`, { includeHiddenElements: true });

/** Roles of the destination/start pins currently on the map. */
export const pinRoles = () => sourceFeatures('markers-pins').map((f) => f.properties?.role as string);

/** The user dot's coordinate as [lng, lat], or null when no user dot is drawn. */
export const userDot = () => {
  const f = sourceFeatures('markers-user')[0];
  return f ? (f.geometry as GeoJSON.Point).coordinates : null;
};

export const facilityIds = () => sourceFeatures('venue-facilities').map((f) => f.properties?.id as string);

/** Simulates a tap that lands on the given feature (what the map's hit layers would report). */
export async function pressMapFeature(kind: string, id: string) {
  (globalThis as { __mockMapHits?: unknown }).__mockMapHits = [{ properties: { id, kind } }];
  try {
    await act(async () => {
      await mapEl().props.onPress({ nativeEvent: { lngLat: [67.0, 24.97], point: [10, 10] } });
      // HomeScreen batches tap candidates for one animation frame before resolving the winner.
      jest.advanceTimersByTime(32);
    });
  } finally {
    (globalThis as { __mockMapHits?: unknown }).__mockMapHits = [];
  }
}

/** Simulates a tap on empty map. */
export async function pressEmptyMap() {
  await act(async () => {
    await mapEl().props.onPress({ nativeEvent: { lngLat: [67.0, 24.97], point: [10, 10] } });
  });
}
