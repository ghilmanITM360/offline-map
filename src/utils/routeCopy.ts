import { t } from '../i18n/translate';

export const ROUTE_NOT_FOUND = () => t('journeyCopy.routeNotFound');
export const CHOOSE_START = () => t('journeyCopy.chooseStart');
export const CHOOSE_DESTINATION = () => t('journeyCopy.chooseDestination');
export const SAME_PLACE = () => t('journeyCopy.samePlace');
export const LOCATION_UNAVAILABLE = () => t('journeyCopy.locationUnavailable');
export const NAVIGATION_UNAVAILABLE = () => t('journeyCopy.navigationUnavailable');
export const OUTSIDE_GUIDE_SCOPE = () => t('journeyCopy.outsideScope');
export const outsideGuideHeadline = (gate: string) => t('journeyCopy.gateFirst', { gate });
