/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// #96: Directory rows for non-routable destinations (isRoutable: false, e.g. Gate 18/19)
// had no visual or accessibility distinction from a normal routable row — same chevron,
// same colors, no accessibilityState — so the "not yet available for routing" subtitle
// was the only signal, and it's swallowed by the row's own accessibilityLabel for
// screen readers. Per the ticket's own scope, the row must still be tappable-to-view
// (DEST-AVAIL-03-equivalent "block routing" is explicitly out of scope here); only the
// muted visual treatment and accessibilityState are new.

import React from 'react';
import { DestinationRow } from '../views/components/directory/DestinationRow';
import { PublicDestinationsService } from '../services/PublicDestinationsService';
import type { V2Place } from '../models/types';
import { fireEvent, render, screen } from './test-utils';

describe('DestinationRow (#96)', () => {
  it('DEST-AVAIL-01: a routable destination has no disabled accessibility state', async () => {
    const routableBlock = PublicDestinationsService.getByCategory('blocks')[0];
    expect(routableBlock.isRoutable).not.toBe(false);
    const onPress = jest.fn();
    await render(<DestinationRow place={routableBlock} onPress={onPress} />);

    const row = screen.getByLabelText(`${routableBlock.name}, Block`);
    expect(row.props.accessibilityState?.disabled).not.toBe(true);

    fireEvent.press(row);
    expect(onPress).toHaveBeenCalledWith(routableBlock);
  });

  it('DEST-AVAIL-08: Gate 18 (field-blocked) row is marked disabled for accessibility', async () => {
    const gate18 = PublicDestinationsService.search('Gate 18')[0] as V2Place | undefined;
    expect(gate18).toBeDefined();
    expect(gate18!.isRoutable).toBe(false);
    await render(<DestinationRow place={gate18!} onPress={jest.fn()} />);

    const row = screen.getByLabelText(`${gate18!.name}, Gate, navigation unavailable`);
    expect(row.props.accessibilityState?.disabled).toBe(true);
  });

  it('DEST-AVAIL-09: Gate 19 (field-blocked) row is marked disabled for accessibility', async () => {
    const gate19 = PublicDestinationsService.search('Gate 19')[0] as V2Place | undefined;
    expect(gate19).toBeDefined();
    expect(gate19!.isRoutable).toBe(false);
    await render(<DestinationRow place={gate19!} onPress={jest.fn()} />);

    const row = screen.getByLabelText(`${gate19!.name}, Gate, navigation unavailable`);
    expect(row.props.accessibilityState?.disabled).toBe(true);
  });

  it('DEST-AVAIL-03/12: pressing a non-routable row still calls onPress (view-only navigation is intentional, not blocked)', async () => {
    const gate18 = PublicDestinationsService.search('Gate 18')[0] as V2Place;
    const onPress = jest.fn();
    await render(<DestinationRow place={gate18} onPress={onPress} />);

    fireEvent.press(screen.getByLabelText(`${gate18.name}, Gate, navigation unavailable`));
    expect(onPress).toHaveBeenCalledWith(gate18);
  });

  it('DEST-AVAIL-04: unavailable reason is still surfaced in the visible subtitle text', async () => {
    const gate18 = PublicDestinationsService.search('Gate 18')[0] as V2Place;
    await render(<DestinationRow place={gate18} onPress={jest.fn()} />);

    expect(screen.getByText(/Not yet available for routing/)).toBeTruthy();
  });
});
