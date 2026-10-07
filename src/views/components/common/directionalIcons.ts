/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { isRtl } from '../../../i18n';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';

/** The layout direction is the app language's (see App.tsx), not the phone's.
 * lucide's chevrons are fixed glyphs and do not mirror under RTL, so pick the one that points the right way:
 * back points to the start edge, forward to the end edge. */
export const backChevron = () => (isRtl() ? ChevronRight : ChevronLeft);
export const forwardChevron = () => (isRtl() ? ChevronLeft : ChevronRight);
