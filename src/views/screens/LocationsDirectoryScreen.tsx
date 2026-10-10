/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { restoreDirectoryOffset } from '../../utils/directoryScrollRestoration';
import type { LayoutChangeEvent } from 'react-native';
import { accuracyFacet } from '../../services/LocationCapability';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, BackHandler, Keyboard, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LocateFixed, Map as MapIcon, MapPin, Search, X } from 'lucide-react-native';

import { RootStackParamList } from '../../navigation/RootNavigator';
import { selectUnfinishedJourney, useAppStore } from '../../store/useAppStore';
import { V2Place } from '../../models/types';
import { DestinationCategoryId, PublicDestinationsService } from '../../services/PublicDestinationsService';
import { V2PlaceAdapter } from '../../services/V2PlaceAdapter';
import { usePressScale } from '../../viewmodels/usePressScale';
import { unavailableReasonCopy } from '../../utils/unavailableReasonCopy';
import { SearchBarField } from '../components/common/SearchBarField';
import { DestinationRow } from '../components/directory/DestinationRow';
import { DestinationBlockGrid } from '../components/directory/DestinationBlockGrid';
import { StartOptionCard } from '../components/map/DirectionsSheetParts';
import { formatLastKnownAge } from '../../utils/formatLastKnownAge';
import { directionsSheetColors, radii, shadows, spacing, staticColors, typography } from '../../theme';

// One accent per category, reused for its chip's active state, its row icon (see
// DestinationRow's own CATEGORY_ACCENT) and the Blocks tile — a single color system
// instead of one blue standing in for both "info chrome" and every category.
const CATEGORY_ACCENT: Record<DestinationCategoryId, string> = {
  blocks: staticColors.normalBlock,
  gates: staticColors.gateAccent,
  rastas: staticColors.info,
  special_routes: staticColors.info,
};

/** Category chip as its own component — each needs its own press-scale Animated.Value,
 * which usePressScale can't give out inside a .map() over Pressables directly. */
function CategoryChip({
  label,
  active,
  accent,
  onPress,
}: {
  label: string;
  active: boolean;
  accent: string;
  onPress: () => void;
}) {
  const { scale, onPressIn, onPressOut } = usePressScale(0.94);
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        style={[styles.chip, active && { backgroundColor: accent, borderColor: accent }]}
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected: active }}
      >
        <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

type Nav = NativeStackNavigationProp<RootStackParamList, 'LocationsDirectory'>;

/**
 * Premium destination directory — the app's entry/discovery layer into the existing map
 * experience (see docs on the selection hand-off in useAppStore's
 * pendingDirectorySelection). Never a second routing or search engine: browsing reads
 * straight from PublicDestinationsService (a thin sort over V2PlaceAdapter, the same
 * source the main map search already indexes from), and typed search delegates entirely
 * to SearchService. Selecting a destination hands it to HomeViewModel's existing
 * handlePlaceSelect via the store bridge, then returns to the map — it never sets
 * selectedPlace, starts navigation, or moves the camera itself.
 */
export function LocationsDirectoryScreen() {
  const navigation = useNavigation<Nav>();
  const currentLocation = useAppStore((s) => s.currentLocation);
  const currentLocationSource = useAppStore((s) => s.currentLocationSource);
  const locationPermissionPrecision = useAppStore((s) => s.locationPermissionPrecision);
  const lastKnownLocation = useAppStore((s) => s.lastKnownLocation);
  const lastKnownLocationUpdatedAt = useAppStore((s) => s.lastKnownLocationUpdatedAt);
  const setPendingDirectorySelection = useAppStore((s) => s.setPendingDirectorySelection);
  const setPendingJourney = useAppStore((s) => s.setPendingJourney);
  // Set by Get Directions when it opens the Directory to choose a start or destination (null = plain browsing).
  // Read once at mount: this screen is pushed for one question, and clearing the store's copy on choose must not
  // flip the title back to "Find your way" while the screen is still animating out.
  const [request] = useState(() => useAppStore.getState().directoryRequest);
  const [storePurpose] = useState(() => useAppStore.getState().directoryPurpose);
  const purpose = storePurpose;
  const chooserDestination = useAppStore((state) => state.routePlannerDest);
  const setDirectoryPurpose = useAppStore((s) => s.setDirectoryPurpose);
  const setDirectoryChoice = useAppStore((s) => s.setDirectoryChoice);
  const recentSearches = useAppStore((s) => s.recentSearches);
  const removeRecentSearch = useAppStore((s) => s.removeRecentSearch);
  const clearRecentSearches = useAppStore((s) => s.clearRecentSearches);
  // #139 Option B: select the id (a primitive) so the selector's fresh marker object never churns the subscription.
  const unfinishedDestinationId = useAppStore((s) => selectUnfinishedJourney(s)?.destinationId ?? null);
  const beginRecovery = useAppStore((s) => s.beginRecovery);
  const clearUnfinishedJourney = useAppStore((s) => s.clearUnfinishedJourney);

  // Browsing survives temporary chooser visits in runtime memory only. Chooser filters stay private.
  const [query, setQuery] = useState(() => storePurpose ? '' : useAppStore.getState().directoryBrowsing.query);
  const [activeCategory, setActiveCategory] = useState<DestinationCategoryId | null>(() => {
    const category = storePurpose ? null : useAppStore.getState().directoryBrowsing.category;
    return PublicDestinationsService.getCategories().find((item) => item.id === category)?.id ?? null;
  });
  const browsingAnchor = useRef(useAppStore.getState().directoryBrowsing.anchor);
  const saveBrowsing = (selectedId: string | null) => {
    if (!storePurpose) useAppStore.getState().setDirectoryBrowsing({ ...useAppStore.getState().directoryBrowsing, query, category: activeCategory, selectedId, anchor: browsingAnchor.current });
  };
  const cancelChooser = () => {
    if (!storePurpose) return true;
    const state = useAppStore.getState();
    if (!request || state.directoryRequest?.serial !== request.serial ||
      state.directoryJourneySerial !== request.journeyId) return false;
    state.cancelDirectoryRequest(request.serial);
    return true;
  };
  useEffect(() => {
    if (!storePurpose) useAppStore.getState().setDirectoryBrowsing({
      ...useAppStore.getState().directoryBrowsing, query, category: activeCategory,
    });
  }, [query, activeCategory, storePurpose]);

  const scrollRef = useRef<ScrollView>(null);
  const geometry = useRef<Record<string, { y: number; parent: string | null }>>({});
  const dimensions = useRef({ content: 0, viewport: 0 });
  const restoring = useRef(!storePurpose);
  const restorationFrame = useRef<number | null>(null);
  const positions = () => {
    const result: Record<string, number> = {};
    const resolve = (key: string): number => {
      const item = geometry.current[key];
      return item ? item.y + (item.parent ? resolve(item.parent) : 0) : 0;
    };
    const visibleIds = new Set((trimmedQuery ? searchResults : categories
      .filter((item) => !activeCategory || item.id === activeCategory)
      .flatMap((item) => PublicDestinationsService.getByCategory(item.id))).map((place) => `place:${place.id}`));
    if (!trimmedQuery && !activeCategory) for (const place of recentPlaces) visibleIds.add(`recent:${place.id}`);
    for (const key of visibleIds) if (geometry.current[key]) result[key] = resolve(key);
    return result;
  };
  const restoreScroll = () => {
    if (!restoring.current || !dimensions.current.viewport || !dimensions.current.content) return;
    if (restorationFrame.current !== null) cancelAnimationFrame(restorationFrame.current);
    restorationFrame.current = requestAnimationFrame(() => {
      restorationFrame.current = null;
      if (!restoring.current) return;
      const saved = useAppStore.getState().directoryBrowsing;
      const anchor = saved.anchor;
      scrollRef.current?.scrollTo({ y: restoreDirectoryOffset(anchor, positions(), dimensions.current.content, dimensions.current.viewport), animated: false });
      restoring.current = false;
    });
  };
  const trackLayout = (key: string, parent: string | null) => (event: LayoutChangeEvent) => {
    geometry.current[key] = { y: event.nativeEvent.layout.y, parent };
    restoreScroll();
  };
  useEffect(() => () => {
    if (restorationFrame.current !== null) cancelAnimationFrame(restorationFrame.current);
  }, []);
  const resetScroll = () => {
    restoring.current = false;
    browsingAnchor.current = null;
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    if (!storePurpose) useAppStore.getState().setDirectoryBrowsing({
      ...useAppStore.getState().directoryBrowsing, anchor: null, selectedId: null,
    });
  };

  const saveScroll = () => {
    if (!storePurpose) useAppStore.getState().setDirectoryBrowsing({
      ...useAppStore.getState().directoryBrowsing, anchor: browsingAnchor.current,
    });
  };
  useEffect(() => () => {
    if (!storePurpose) useAppStore.getState().setDirectoryBrowsing({
      ...useAppStore.getState().directoryBrowsing, anchor: browsingAnchor.current,
    });
  }, [storePurpose]);

  const categories = useMemo(() => PublicDestinationsService.getCategories(), []);
  const trimmedQuery = query.trim();

  const searchResults = useMemo(() => {
    if (trimmedQuery.length === 0) return [];
    const results = PublicDestinationsService.search(trimmedQuery, currentLocation ?? undefined);
    return activeCategory
      ? results.filter((place) => PublicDestinationsService.categoryIdForPlace(place) === activeCategory)
      : results;
  }, [trimmedQuery, activeCategory, currentLocation]);

  // #99: recentSearches stores full Place snapshots at selection time, so re-resolve each
  // by id through V2PlaceAdapter (the same lookup favorites already re-validates through)
  // to pick up current routability/name and drop anything no longer resolvable — never
  // trust the stale snapshot itself.
  const recentPlaces = useMemo(() => {
    return recentSearches
      .map((place) => V2PlaceAdapter.getPlaceById(place.id))
      .filter((place): place is V2Place => Boolean(place))
      .slice(0, 5);
  }, [recentSearches]);

  const confirmClearRecent = useCallback(() => {
    Alert.alert('Clear recent places?', 'Places you opened recently will be removed from this list.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: clearRecentSearches },
    ]);
  }, [clearRecentSearches]);

  // Start-only quick options, shown only when the location behind them is usable.
  const canUseCurrentLocation =
    !!currentLocation && currentLocationSource === 'live' && accuracyFacet(true, locationPermissionPrecision) !== 'approximate';
  const canUseLastKnown = !!lastKnownLocation;

  const goToMap = useCallback(() => {
    Keyboard.dismiss();
    // Pushed from Home (reopened): back to the map, MapView never remounts. Reached at
    // launch via StartupManager (nothing to go back to): replace, matching how
    // Splash/Welcome/Permission hand off to their next screen.
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.replace('Main');
    }
  }, [navigation]);

  // Leaving without choosing (Cancel, hardware back) must not leave the purpose behind for the next visit.
  useEffect(() => () => {
    // An outgoing chooser must never cancel a newer request or erase its submitted answer.
    const state = useAppStore.getState();
    if (request && state.directoryPurpose) state.cancelDirectoryRequest(request.serial);
  }, [request]);

  // Details: show the place on the Map with its sheet (the old row-tap behavior), for people who want to look first.
  const handleDetails = useCallback(
    (place: V2Place) => {
      saveBrowsing(place.id);
      setPendingDirectorySelection(place);
      goToMap();
    },
    [goToMap, setPendingDirectorySelection, query, activeCategory, storePurpose],
  );

  // Ordinary selection opens destination planning on the existing Map. Origin resolution stays there.
  // Unavailable places retain their Details explanation.
  const takeMeTo = useCallback(
    (place: V2Place) => {
      if (place.isRoutable === false) {
        handleDetails(place);
        return;
      }
      saveBrowsing(place.id);
      setPendingJourney({ destination: place });
      goToMap();
    },
    [goToMap, handleDetails, setPendingJourney, query, activeCategory, storePurpose],
  );

  const handleSelect = useCallback(
    (place: V2Place) => {
      if (storePurpose) {
        // An unavailable place is never a valid start or destination: say so and stay here.
        const usable = storePurpose === 'start' ? place.isStartRoutable !== false : place.isRoutable !== false;
        if (!usable) {
          Alert.alert(
            'Place unavailable',
            unavailableReasonCopy(place.unavailableReason) ?? `${place.name} is not available on the map yet.`,
          );
          return;
        }
        if (!request) return;
        if (!setDirectoryChoice({ purpose: storePurpose, place, request })) return;
        goToMap();
        return;
      }
      // Plain browsing: a tap means "take me here" (#307).
      takeMeTo(place);
    },
    [goToMap, setDirectoryChoice, setDirectoryPurpose, setPendingJourney, storePurpose, request, takeMeTo],
  );

  const handleGetNewRoute = useCallback(() => {
    const place = beginRecovery();
    if (!place) {
      goToMap();
      return;
    }
    // beginRecovery stages the place for the details hand-off; "Get new route" plans a journey instead.
    setPendingDirectorySelection(null);
    takeMeTo(place as V2Place);
  }, [beginRecovery, goToMap, setPendingDirectorySelection, takeMeTo]);

  const unfinishedDestinationName = useMemo(
    () => (unfinishedDestinationId ? V2PlaceAdapter.getPlaceById(unfinishedDestinationId)?.name ?? null : null),
    [unfinishedDestinationId],
  );

  const handleQuickStart = useCallback(
    (quick: 'current_location' | 'last_known') => {
      if (!request) return;
      if (!setDirectoryChoice({ purpose: 'start', quick, request })) return;
      goToMap();
    },
    [goToMap, request, setDirectoryChoice, setDirectoryPurpose],
  );

  // Android Back cancels an explicit chooser first. Browsing clears search/filter state
  // before falling through to the default stack behavior — exit
  // the app at initial launch, or pop back to the map when reopened from there.
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (storePurpose) {
        if (cancelChooser()) goToMap();
        return true;
      }
      if (trimmedQuery.length > 0 || activeCategory) {
        setQuery('');
        setActiveCategory(null);
        return true;
      }
      return false;
    });
    return () => subscription.remove();
  }, [trimmedQuery, activeCategory, storePurpose, setDirectoryPurpose, setDirectoryChoice, goToMap]);

  const handleCategoryPress = (categoryId: DestinationCategoryId) => {
    resetScroll();
    setActiveCategory((current) => (current === categoryId ? null : categoryId));
  };

  const renderBrowse = () => {
    const visibleCategories = activeCategory ? categories.filter((c) => c.id === activeCategory) : categories;
    return visibleCategories.map((category) => {
      const places = PublicDestinationsService.getByCategory(category.id);
      return (
        <View key={category.id} style={styles.section} onLayout={trackLayout(`section:${category.id}`, null)}>
          <Text style={styles.sectionTitle} accessibilityRole="header">
            {category.label} ({places.length})
          </Text>
          {category.id === 'blocks' ? (
            <View onLayout={trackLayout('blocks-grid', 'section:blocks')}>
              <DestinationBlockGrid places={places} onPress={handleSelect} onDetails={purpose ? undefined : handleDetails}
                onPlaceLayout={(id, event) => trackLayout(`place:${id}`, 'blocks-grid')(event)} />
            </View>
          ) : (
            <View style={styles.sectionRows} onLayout={trackLayout(`rows:${category.id}`, `section:${category.id}`)}>
              {places.map((place) => (
                <View key={place.id} onLayout={trackLayout(`place:${place.id}`, `rows:${category.id}`)}><DestinationRow place={place} onPress={handleSelect} onDetails={purpose ? undefined : handleDetails} showCategory={false} /></View>
              ))}
            </View>
          )}
        </View>
      );
    });
  };

  const renderSearchResults = () => {
    if (searchResults.length === 0) {
      return (
        <View style={styles.emptyState} accessibilityLiveRegion="polite">
          <Text style={styles.emptyTitle}>{`No matches for "${trimmedQuery}"`}</Text>
          <Text style={styles.emptyHint}>Try a block or gate number, like 24 or Gate 15.</Text>
        </View>
      );
    }
    return (
      <View style={styles.sectionRows} onLayout={trackLayout("search", null)}>
        {searchResults.map((place) => (
          <View key={place.id} testID={`directory-place-${place.id}`} onLayout={trackLayout(`place:${place.id}`, "search")}><DestinationRow place={place} onPress={handleSelect} onDetails={purpose ? undefined : handleDetails} /></View>
        ))}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        {/* Short title (was two lines: a long question plus a subtitle that just repeated what the
            search placeholder already says). It may wrap: at 200% font on a 320 dp window one line
            truncated to "Find your…" beside the Map pill (#128 A). */}
        <Text style={styles.title} accessibilityRole="header">
          {purpose === 'start' ? 'Where are you starting from?' : purpose === 'destination' ? 'Where do you want to go?' : 'Find your way'}
        </Text>
        <Pressable
          style={styles.viewMapButton}
          onPress={() => { if (cancelChooser()) goToMap(); }}
          accessibilityRole="button"
          accessibilityLabel={purpose ? 'Cancel and go back' : 'View map'}
        >
          {purpose ? <X size={18} color={staticColors.info} /> : <MapIcon size={18} color={staticColors.info} />}
          <Text style={styles.viewMapLabel}>{purpose ? 'Cancel' : 'Map'}</Text>
        </Pressable>
      </View>

      {purpose === 'start' && chooserDestination ? (
        <Text style={styles.journeyTo} accessibilityLiveRegion="polite">{`To ${chooserDestination.name}`}</Text>
      ) : null}

      <View style={styles.searchWrap}>
        <Search size={18} color={staticColors.iconMuted} style={styles.searchIcon} />
        <SearchBarField
          value={query}
          onChangeText={(value) => { resetScroll(); setQuery(value); }}
          // Same words as Home's search and this field's name. The old 31-character hint wrapped at 200% font
          // and the fixed-height field clipped it; Android's TextInput cannot ellipsize a placeholder.
          placeholder="Search destinations"
          style={[styles.searchInput, query.length > 0 && styles.searchInputWithClear]}
          accessibilityLabel="Search destinations"
          autoCorrect={false}
        />
        {query.length > 0 && (
          <Pressable
            style={styles.clearButton}
            onPress={() => { resetScroll(); setQuery(''); }}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            hitSlop={8}
          >
            <X size={18} color={staticColors.iconMuted} />
          </Pressable>
        )}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipsRow}
        contentContainerStyle={styles.chipsContent}
      >
        {categories.map((category) => (
          <CategoryChip
            key={category.id}
            label={category.label}
            active={activeCategory === category.id}
            accent={CATEGORY_ACCENT[category.id]}
            onPress={() => handleCategoryPress(category.id)}
          />
        ))}
      </ScrollView>

      <ScrollView ref={scrollRef} testID="directory-list" contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled"
        onLayout={(event) => { dimensions.current.viewport = event.nativeEvent.layout.height; restoreScroll(); }}
        onContentSizeChange={(_, height) => { dimensions.current.content = height; restoreScroll(); }}
        onScrollBeginDrag={() => { restoring.current = false; }}
        onScrollEndDrag={saveScroll}
        onMomentumScrollEnd={saveScroll}
        scrollEventThrottle={32}
        onScroll={(event) => {
          if (storePurpose || restoring.current) return;
          const offset = event.nativeEvent.contentOffset.y;
          const entries = Object.entries(positions()).filter(([key, y]) => (key.startsWith('place:') || key.startsWith('recent:')) && y <= offset)
            .sort((left, right) => right[1] - left[1]);
          const first = entries[0];
          browsingAnchor.current = first ? { id: first[0], delta: offset - first[1] } : null;
        }}>
        {unfinishedDestinationId !== null && !purpose && (
          <View style={styles.recoveryCard} accessibilityLiveRegion="polite">
            <Text style={styles.recoveryTitle}>Your last navigation didn't finish</Text>
            <Text style={styles.recoveryBody}>
              {unfinishedDestinationName
                ? `You were heading to ${unfinishedDestinationName}. Want a new route from where you are now?`
                : "Your last navigation didn't finish. Want a new route from where you are now?"}
            </Text>
            <View style={styles.recoveryActions}>
              <Pressable
                style={[styles.recoveryButton, styles.recoveryPrimary]}
                onPress={handleGetNewRoute}
                accessibilityRole="button"
                accessibilityLabel="Get new route"
              >
                <Text style={styles.recoveryPrimaryLabel}>Get new route</Text>
              </Pressable>
              <Pressable
                style={styles.recoveryButton}
                onPress={clearUnfinishedJourney}
                accessibilityRole="button"
                accessibilityLabel="Dismiss"
              >
                <Text style={styles.recoverySecondaryLabel}>Dismiss</Text>
              </Pressable>
            </View>
          </View>
        )}
        {trimmedQuery.length > 0 ? (
          renderSearchResults()
        ) : (
          <>
            {purpose === 'start' && !activeCategory && (canUseCurrentLocation || canUseLastKnown) && (
              <View style={styles.quickStarts}>
                {canUseCurrentLocation && (
                  <StartOptionCard
                    icon={<LocateFixed size={26} color={directionsSheetColors.brand} />}
                    title="Use my location"
                    subtitle="We pick the nearest gate for you"
                    onPress={() => handleQuickStart('current_location')}
                  />
                )}
                {canUseLastKnown && (
                  <StartOptionCard
                    icon={<MapPin size={26} color={directionsSheetColors.brand} />}
                    title="Use earlier location"
                    subtitle={`Saved ${formatLastKnownAge(lastKnownLocationUpdatedAt)}`}
                    onPress={() => handleQuickStart('last_known')}
                  />
                )}
              </View>
            )}
            {!activeCategory && recentPlaces.length > 0 && (
              <View style={styles.section} testID="directory-recent" onLayout={trackLayout("recent", null)}>
                <View style={styles.recentHeader}>
                  <Text style={[styles.sectionTitle, styles.recentTitle]} accessibilityRole="header">Recent</Text>
                  <Pressable
                    style={styles.recentClear}
                    onPress={confirmClearRecent}
                    accessibilityRole="button"
                    accessibilityLabel="Clear recent places"
                  >
                    <Text style={styles.recentClearLabel}>Clear</Text>
                  </Pressable>
                </View>
                <View style={styles.sectionRows} testID="directory-recent-rows" onLayout={trackLayout("recent-rows", "recent")}>
                  {recentPlaces.map((place) => (
                    <View key={place.id} testID={`directory-recent-${place.id}`} onLayout={trackLayout(`recent:${place.id}`, 'recent-rows')}>
                    <DestinationRow
                      place={place}
                      onPress={handleSelect}
                      onDetails={purpose ? undefined : handleDetails}
                      onRemove={(p) => removeRecentSearch(p.id)}
                    />
                    </View>
                  ))}
                </View>
              </View>
            )}
            {renderBrowse()}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: staticColors.white,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    gap: spacing.md,
  },
  journeyTo: {
    marginHorizontal: spacing.xl,
    marginTop: spacing.xs,
    fontSize: 16,
    fontWeight: '700',
    color: staticColors.textSecondaryStrong,
  },
  title: {
    ...typography.sheet.title,
    fontSize: 22,
    flex: 1,
  },
  viewMapButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    // Android's 48dp minimum touch target — the padding above alone renders at ~36dp.
    // minHeight only, not a redesign: the pill still hugs its content visually, just
    // with a taller tappable box centered around it.
    minHeight: 48,
    // radii.pill (999) is a sentinel meant to be applied as Math.min(height, width) / 2
    // at the call site (see radii.ts), not used as a bare literal — radii.xxl still
    // renders a full pill at this ~36dp height without relying on the sentinel value.
    borderRadius: radii.xxl,
    backgroundColor: staticColors.infoBackground,
  },
  viewMapLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: staticColors.info,
  },
  searchWrap: {
    marginTop: spacing.lg,
    marginHorizontal: spacing.xl,
    justifyContent: 'center',
    borderRadius: radii.lg,
    // The app's central "find your destination" action (mission priority #1) — a
    // little elevation over the plain-bordered field makes it read as the primary
    // action on the screen, not just another input.
    ...shadows.low,
  },
  searchIcon: {
    position: 'absolute',
    left: spacing.md,
    zIndex: 1,
  },
  searchInput: {
    paddingLeft: 44,
    paddingRight: spacing.lg,
  },
  searchInputWithClear: {
    paddingRight: 44,
  },
  clearButton: {
    position: 'absolute',
    right: spacing.md,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipsRow: {
    marginTop: spacing.md,
    flexGrow: 0,
    // Default flexShrink is 1: with the tall results list below in the same column, Yoga shrank this
    // row and clipped the 48dp chips to ~36dp. Keep its full content height.
    flexShrink: 0,
  },
  chipsContent: {
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
    paddingBottom: spacing.sm,
  },
  chip: {
    // Fixed height (not content-driven padding) — on some Android devices this chip's
    // Text intermittently painted at its full natural size before Yoga's layout pass had
    // measured it, one frame ahead of the box that was about to contain it, and the
    // chip's own rounded-corner clipping cut off the top of every letter until the next
    // layout pass caught up (confirmed on-device, reproduced intermittently, not tied to
    // any one style property). A height fixed from the very first frame — with no
    // dependency on text measurement — removes the race entirely. 48 (not the original
    // 36) also meets Android's minimum touch target — still a static, non-content-driven
    // value, so the race-avoidance property above holds.
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    // See viewMapButton above — radii.pill (999) is meant to be applied as
    // Math.min(height, width) / 2, not used as a bare literal on a ~36dp chip.
    borderRadius: radii.xxl,
    backgroundColor: staticColors.white,
    borderWidth: 1,
    borderColor: staticColors.border,
  },
  chipActive: {
    backgroundColor: staticColors.info,
    borderColor: staticColors.info,
  },
  chipText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
    color: staticColors.textPrimary,
  },
  chipTextActive: {
    color: staticColors.white,
    fontWeight: '700',
  },
  scrollContent: {
    paddingBottom: spacing.xxl,
  },
  quickStarts: {
    paddingHorizontal: spacing.xl,
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  recoveryCard: {
    marginHorizontal: spacing.xl,
    marginTop: spacing.lg,
    padding: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: staticColors.infoBackground,
    gap: spacing.sm,
  },
  recoveryTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: staticColors.textPrimary,
  },
  recoveryBody: {
    fontSize: 14,
    color: staticColors.textPrimary,
  },
  recoveryActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  recoveryButton: {
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: radii.xxl,
  },
  recoveryPrimary: {
    backgroundColor: staticColors.info,
  },
  recoveryPrimaryLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: staticColors.white,
  },
  recoverySecondaryLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: staticColors.info,
  },
  section: {
    marginTop: spacing.lg,
  },
  recentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  recentTitle: {
    flex: 1,
    marginBottom: 0, // the header row, not the title, owns the gap to the rows
  },
  recentClear: {
    minHeight: 48, // Android's 48dp minimum touch target
    minWidth: 48,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  recentClearLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: staticColors.info,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: staticColors.iconMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.sm,
  },
  sectionRows: {
    backgroundColor: staticColors.white,
  },
  emptyState: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: staticColors.textPrimary,
    textAlign: 'center',
  },
  emptyHint: {
    fontSize: 14,
    color: staticColors.textMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
});
