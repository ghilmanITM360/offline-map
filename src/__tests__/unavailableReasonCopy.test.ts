import { unavailableReasonCopy } from '../utils/unavailableReasonCopy';

describe('unavailableReasonCopy (#128 E)', () => {
  test('swaps the data-team wording for what the visitor can do', () => {
    expect(unavailableReasonCopy('Gate 18 needs connector verification before routing.')).toBe(
      "Gate 18 isn't ready for directions yet. Choose another place.",
    );
    expect(unavailableReasonCopy('This gate needs connector verification before navigation.')).toBe(
      "This gate isn't ready for directions yet. Choose another place.",
    );
  });

  test('leaves other reasons and empty values alone', () => {
    expect(unavailableReasonCopy('Lahore Gate is closed today.')).toBe('Lahore Gate is closed today.');
    expect(unavailableReasonCopy(undefined)).toBeUndefined();
  });
});
