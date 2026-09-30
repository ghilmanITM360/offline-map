/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { I18nManager } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';

/** lucide's chevrons are fixed glyphs and do not mirror under RTL, so pick the one that points the right way:
 * back points to the start edge, forward to the end edge. */
export const backChevron = () => (I18nManager.isRTL ? ChevronRight : ChevronLeft);
export const forwardChevron = () => (I18nManager.isRTL ? ChevronLeft : ChevronRight);
