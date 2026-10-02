/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The place adapters describe an unroutable gate in the data team's words ("needs connector
 * verification before routing"). Visitors need to know what happened and what to do, so the views
 * show this wording instead (#128 E). The adapters and their tests keep the original reason.
 */
export function unavailableReasonCopy(reason: string | undefined): string | undefined {
  return reason?.replace(
    /\s+needs connector verification before (?:routing|navigation)\.?$/i,
    " isn't ready for directions yet. Choose another place.",
  );
}
