/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react-native';

import { directionsSheetColors as c } from '../../../theme';
import { useI18n } from '../../../i18n';
import {
  DirectionsHeader as SdkDirectionsHeader,
  type DirectionsHeaderTheme,
} from '../../../../packages/offline-navigation/src/ui/DirectionsHeader';
import {
  RouteEndpointRows as SdkRouteEndpointRows,
  type EndpointRow,
  type RouteEndpointRowsTheme,
} from '../../../../packages/offline-navigation/src/ui/RouteEndpointRows';
import {
  StartOptionCard as SdkStartOptionCard,
  type StartOptionCardTheme,
} from '../../../../packages/offline-navigation/src/ui/StartOptionCard';

/**
 * Presentational pieces of the Get Directions sheet (#177). They hold no route, GPS or
 * selection logic — LocationSheet owns every handler and all copy, these only draw it.
 * Horizontal spacing uses start/end props and chevrons mirror under RTL.
 */

const headerColors = { headingText: c.headingText, secondaryText: c.secondaryText, backButtonFill: c.backButtonFill };

/** Ijtema binding for the SDK header: supplies the back label, direction and app colours; same props as before B4b-3. */
export function DirectionsHeader(props: {
  title: string;
  subtitle: string;
  onBack: () => void;
  focusKey?: string | null;
  accessibilityContext?: string;
}) {
  const { t, isRTL } = useI18n();
  const theme = useMemo<DirectionsHeaderTheme>(() => ({ BackIcon: isRTL ? ChevronRight : ChevronLeft, colors: headerColors }), [isRTL]);
  return <SdkDirectionsHeader {...props} backLabel={t('directions.back')} isRTL={isRTL} theme={theme} />;
}

export type { EndpointRow };

const endpointColors = {
  cardBorder: c.cardBorder,
  cardFill: c.background,
  iconDisc: c.iconDisc,
  headingText: c.headingText,
  secondaryText: c.secondaryText,
  pressedFill: c.actionPressedFill,
};

/**
 * Route-ready summary: both ends of the walk as two short rows (FROM / TO) so neither needs
 * recalling or scrolling to. Ijtema binding for the SDK rows: supplies direction and app colours; same props as before B4b-5.
 */
export function RouteEndpointRows(props: { from: EndpointRow; to: EndpointRow; children?: React.ReactNode }) {
  const { isRTL } = useI18n();
  const theme = useMemo<RouteEndpointRowsTheme>(() => ({ ForwardIcon: isRTL ? ChevronLeft : ChevronRight, colors: endpointColors }), [isRTL]);
  return <SdkRouteEndpointRows {...props} theme={theme} />;
}

const startOptionColors = {
  optionFill: c.optionFill,
  optionBorder: c.optionBorder,
  optionSelectedFill: c.optionSelectedFill,
  optionSelectedBorder: c.optionSelectedBorder,
  pressedFill: c.actionPressedFill,
  iconDisc: c.iconDisc,
  iconDiscSolid: c.iconDiscSolid,
  headingText: c.headingText,
  secondaryText: c.secondaryText,
  brand: c.brand,
  brandText: c.brandText,
};

/** Ijtema binding for the SDK start option: supplies direction, icons and app colours; same props as before B4b-4. */
export function StartOptionCard(props: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  active?: boolean;
  disabled?: boolean;
  loading?: boolean;
  onPress: () => void;
}) {
  const { isRTL } = useI18n();
  const theme = useMemo<StartOptionCardTheme>(
    () => ({ ForwardIcon: isRTL ? ChevronLeft : ChevronRight, LoadingIcon: RefreshCw, colors: startOptionColors }),
    [isRTL],
  );
  return <SdkStartOptionCard {...props} theme={theme} />;
}
