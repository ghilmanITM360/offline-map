/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { I18nManager } from 'react-native';

function load(isRTL: boolean) {
  jest.resetModules();
  Object.defineProperty(I18nManager, 'isRTL', { value: isRTL, configurable: true });
  return require('../views/components/map/PhysicalLayer') as typeof import('../views/components/map/PhysicalLayer');
}

describe('physical right-edge offsets', () => {
  it('uses right/marginRight in LTR', () => {
    const m = load(false);
    expect(m.physicalRight(8)).toEqual({ right: 8 });
    expect(m.physicalMarginRight(8)).toEqual({ marginRight: 8 });
  });

  it('uses left/marginLeft in RTL so the swapped offset lands on the physical right', () => {
    const m = load(true);
    expect(m.physicalRight(8)).toEqual({ left: 8 });
    expect(m.physicalMarginRight(8)).toEqual({ marginLeft: 8 });
  });
});
