/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { hangSelectedLabelsBelowPin, DESTINATION_PIN_LABEL_CLEARANCE, type MapLabelItem } from '../views/components/map/MapLabelOverlay';

const item = (id: string, extra: Partial<MapLabelItem> = {}): MapLabelItem => ({
  id,
  coordinate: { latitude: 25, longitude: 67 },
  text: id,
  kind: 'block',
  zPriority: 8,
  ...extra,
});

describe('hangSelectedLabelsBelowPin', () => {
  it('moves only the selected label below the pin tip, so the pin never covers its own name', () => {
    const out = hangSelectedLabelsBelowPin([item('a', { isSelected: true }), item('b')], true);
    expect(out[0].yOffset).toBe(DESTINATION_PIN_LABEL_CLEARANCE);
    expect(out[1].yOffset).toBeUndefined();
  });

  it('leaves every label alone when no destination pin is drawn', () => {
    const items = [item('a', { isSelected: true })];
    expect(hangSelectedLabelsBelowPin(items, false)).toBe(items);
  });

  it('does not mutate the input labels', () => {
    const a = item('a', { isSelected: true });
    hangSelectedLabelsBelowPin([a], true);
    expect(a.yOffset).toBeUndefined();
  });
});
