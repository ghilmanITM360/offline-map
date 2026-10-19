import React from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { fireEvent, render, screen } from './test-utils';
import { OsmAttribution } from '../views/components/map/OsmAttribution';

describe('OSM attribution', () => {
  test('is absent when no OSM-derived content is visible', async () => {
    await render(<View><OsmAttribution visible={false} top={100} /></View>);
    expect(screen.queryByTestId('osm-attribution')).not.toBeOnTheScreen();
  });

  test('visibly credits contributors and links to ODbL information', async () => {
    const openSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue();
    await render(<View><OsmAttribution visible top={100} /></View>);
    expect(screen.getByText('© OpenStreetMap contributors · ODbL')).toBeOnTheScreen();
    expect(StyleSheet.flatten(screen.getByTestId('osm-attribution').props.style)).toMatchObject({ direction: 'ltr', right: 8, top: 100 });
    fireEvent.press(screen.getByTestId('osm-attribution'));
    expect(openSpy).toHaveBeenCalledWith('https://www.openstreetmap.org/copyright');
  });
});
