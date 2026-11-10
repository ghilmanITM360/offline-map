/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import type { Insets, StyleProp, ViewStyle } from 'react-native';
import type { PlaceCategory } from '../domain/pack';
import type { LiveStartBlocker, NavigationError, NavigationPhase, NavigationRoute } from '../domain/navigation';
import type { VenueCoordinate, VenuePlace } from '../domain/venue';
import type { ManualLiveUpgradeCardLabels } from './ManualLiveUpgradeCard';
import type { RouteGuideCardLabels } from './RouteGuideCard';
import type { RouteStepCopy } from './RouteStepCopy';

/** How the host names a venue place. The SDK knows only ids, kinds and graph nodes; names are the host's. */
export interface NavigationPlacePresentation {
  title: string;
  subtitle?: string;
  /** Extra words the search should match (other spellings, scripts, nicknames). */
  searchTerms?: readonly string[];
}

/** What the screen can ask of the host's map. */
export interface NavigationMapHandle {
  /** Bring the camera back to the walker/route. Called from the Recenter controls. */
  recenter(): void;
}

/** Everything the host's map needs to draw the journey. The map renders; it never decides anything. */
export interface NavigationMapProps {
  phase: NavigationPhase;
  route: NavigationRoute | null;
  originId: string | null;
  destinationId: string | null;
  /** The live fix snapped onto the route. Null in every phase but `live`, and before the first accepted fix. */
  position: VenueCoordinate | null;
  stepIndex: number;
  /** Call with false when the basemap cannot be shown (the screen then says directions still work). */
  onAvailabilityChange: (available: boolean) => void;
  /** The theme's appearance. Switching it must restyle the map in place, never remount it or move the camera. */
  colorScheme?: 'light' | 'dark';
  ref?: React.Ref<NavigationMapHandle>;
}

export type NavigationIcon = React.ComponentType<{ size?: number; color?: string }>;

/** The one button primitive the screen and its leaves share. */
export interface NavigationButtonProps {
  label?: string;
  variant?: 'brand' | 'brandTint' | 'outline';
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  icon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
  disabled?: boolean;
  /** A choice that is currently picked (the entry-gate chooser). Exposed to assistive technology as selected. */
  selected?: boolean;
  onPress?: () => void;
}

/**
 * The host's design system for the whole screen. One object: the screen derives each leaf's own theme from it.
 * Icons and chevrons must already be chosen for the reading direction (back points to the start edge).
 */
export interface NavigationScreenTheme {
  /** Which basemap palette the map uses. Default 'light': a custom dark theme must say so. */
  colorScheme?: 'light' | 'dark';
  colors: {
    screen: string;
    surface: string;
    surfaceMuted: string;
    border: string;
    text: string;
    textSecondary: string;
    brand: string;
    onBrand: string;
    /** Soft brand fill: icon discs, selected rows, secondary buttons. */
    brandTint: string;
    pressed: string;
    warningFill: string;
    warningText: string;
    infoFill: string;
    infoBorder: string;
    infoText: string;
    scrim: string;
  };
  radius: number;
  hitSlop: Insets;
  icons: {
    Back: NavigationIcon;
    Forward: NavigationIcon;
    Loading: NavigationIcon;
    Pin: NavigationIcon;
    Recenter: NavigationIcon;
    Place: NavigationIcon;
    Guide: NavigationIcon;
    Location: NavigationIcon;
  };
  /** A function component, so each leaf may use it with its own (narrower) prop set. */
  Button: React.FunctionComponent<NavigationButtonProps>;
}

/** Resolved wording for the whole screen; the host owns language. English ships separately and is optional. */
export interface NavigationScreenCopy {
  routeStep: RouteStepCopy;
  directory: {
    destinationTitle: string;
    destinationSubtitle: string;
    originTitle: string;
    originSubtitle: string;
    back: string;
    searchLabel: string;
    searchPlaceholder: string;
    /** The venue lists no places. */
    empty: string;
    noMatches: (query: string) => string;
    /** The line under a place whose route is not a plain verified one. */
    availability: { provisional: string; unreachable: string; pending: string };
    /** Filter chip labels; `all` clears the filter. */
    categories: Record<PlaceCategory | 'all', string>;
    /** Tells apart places that share a name; receives the marhala number. */
    marhala: (marhala: string) => string;
    sameName: string;
  };
  trip: {
    title: (destination: string) => string;
    back: string;
    from: string;
    to: string;
    chooseStart: string;
    yourLocation: string;
    changeFrom: (origin: string) => string;
    changeTo: (destination: string) => string;
    loading: string;
    needsOrigin: string;
    samePlace: string;
    /** Receives the formatted walking distance. */
    summary: (distance: string) => string;
    errors: Record<NavigationError, string>;
    /** Shown on a route that ends at an unverified boundary point rather than at a surveyed entrance. */
    provisionalAccess: string;
    /** Names the marker where the route actually ends (the destination's own marker is separate). */
    routeEndsHere: string;
    retry: string;
    startGuide: { title: string; subtitle: string };
    startLive: { title: string; subtitle: string; busy: string };
  };
  guide: RouteGuideCardLabels;
  /** The confirmation shown before a Manual Guide is upgraded to Live. */
  upgrade: Pick<ManualLiveUpgradeCardLabels, 'confirm' | 'acquiring' | 'preview' | 'start' | 'failed' | 'preserved' | 'continue' | 'retry' | 'cancel'>;
  /** One plain sentence per reason live navigation could not start. */
  liveBlockers: Record<LiveStartBlocker, string>;
  live: {
    /** Receives the formatted distance left and the whole minutes left. */
    remaining: (distance: string, minutes: number) => string;
    gpsWeak: string;
    gpsLost: string;
    /** Spoken (iOS VoiceOver) when a lost or weak signal returns. Optional: without it the recovery is not announced. */
    gpsRecovered?: string;
    rerouting: string;
    rerouted: string;
    keptRoute: string;
    exit: string;
    recenter: string;
    recenterA11y: string;
  };
  arrival: { title: string; subtitle: string; recenter: string; recenterA11y: string; done: string; doneA11y: string };
  mapUnavailable: string;
  /**
   * Wording for the entry-gate chooser. Optional: without it the screen never shows one, whatever gates the controller's outside-route
   * provider lists.
   */
  entryGate?: {
    title: string;
    /** Clears the choice, so the provider picks the gate. */
    automatic: string;
    automaticA11y: string;
    /** Spoken name of the action for one already-localized gate label. */
    option: (gate: string) => string;
  };
}

export interface NavigationScreenProps {
  copy: NavigationScreenCopy;
  theme: NavigationScreenTheme;
  isRTL: boolean;
  /** Names a place, or returns null to leave it out of the directory. Without it the place id is shown. */
  describePlace?: (place: VenuePlace) => NavigationPlacePresentation | null;
  /** The host's map. Omit for a directions-only screen. */
  MapComponent?: React.ComponentType<NavigationMapProps>;
  /** Offer live navigation at all. Default true; a controller without a location adapter reports it as unsupported. */
  allowLive?: boolean;
  /** Show the live route and wait for a second tap before going live (default). False starts Live on the first tap. */
  reviewLiveRoute?: boolean;
  /** Host safe-area bottom inset for the panel. Default 0. */
  bottomInset?: number;
  /**
   * Bottom inset for the arrival sheet. The sheet is a Modal, a separate window that always draws under the system navigation bar,
   * so it needs the system inset even when `bottomInset` is 0 because the host's own bar clears it below the panel. Defaults to `bottomInset`.
   */
  arrivalBottomInset?: number;
  /** Back was pressed on the directory itself; without it the directory shows no Back control. */
  onClose?: () => void;
  /** A trip ended: the user left it, or finished it on arrival. */
  onTripEnded?: (reason: 'exit' | 'arrived') => void;
  /** Applied to the root, where the host adds safe-area padding. */
  style?: StyleProp<ViewStyle>;
}
