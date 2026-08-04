import React from 'react';
import { screen } from '@testing-library/react-native';

import { OutsideRoutePolyline } from '../views/components/navigation/OutsideRoutePolyline';
import { render } from './test-utils';

const coordinates = [
  { latitude: 24.96, longitude: 67.01 },
  { latitude: 24.9605, longitude: 67.0105 },
  { latitude: 24.961, longitude: 67.011 },
];

describe('OutsideRoutePolyline', () => {
  test('road-following route uses solid geometry', async () => {
    await render(<OutsideRoutePolyline coordinates={coordinates} roadFollowing zIndex={10} />);
    expect(screen.getByTestId('outside-route-line')).not.toHaveProp('lineDashPattern');
  });

  test('direct guide uses dashed geometry and explicit semantic label', async () => {
    await render(<OutsideRoutePolyline coordinates={coordinates} roadFollowing={false} zIndex={10} />);
    expect(screen.getByTestId('outside-route-line')).toHaveProp('lineDashPattern', [8, 6]);
  });
});
