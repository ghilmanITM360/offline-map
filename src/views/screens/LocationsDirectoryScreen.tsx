/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Animated, BackHandler, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Map as MapIcon, Search, X } from 'lucide-react-native';

import { RootStackParamList } from '../../navigation/RootNavigator';
import { useAppStore } from '../../store/useAppStore';
import { V2Place } from '../../models/types';
import { DestinationCategoryId, PublicDestinationsService } from '../../services/PublicDestinationsService';
import { V2PlaceAdapter } from '../../services/V2PlaceAdapter';
import { usePressScale } from '../../viewmodels/usePressScale';
import { unavailableReasonCopy } from '../../utils/unavailableReasonCopy';
import { SearchBarField } from '../components/common/SearchBarField';
import { DestinationRow } from '../components/directory/DestinationRow';
import { DestinationBlockGrid } from '../components/directory/DestinationBlockGrid';
import { radii, shadows, spacing, staticColors, typography } from '../../theme';

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
  const setPendingDirectorySelection = useAppStore((s) => s.setPendingDirectorySelection);
  // Set by Get Directions when it opens the Directory to choose a start or destination (null = plain browsing).
  // Read once at mount: this screen is pushed for one question, and clearing the store's copy on choose must not
  // flip the title back to "Find your way" while the screen is still animating out.
  const [purpose] = useState(() => useAppStore.getState().directoryPurpose);
  const setDirectoryPurpose = useAppStore((s) => s.setDirectoryPurpose);
  const setDirectoryChoice = useAppStore((s) => s.setDirectoryChoice);
  const recentSearches = useAppStore((s) => s.recentSearches);

  // Deliberately ephemeral component state — search text, category filter, and scroll
  // position are not persisted (see brief: ephemeral directory UI).
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<DestinationCategoryId | null>(null);

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

  const goToMap = useCallback(() => {
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
  useEffect(() => () => setDirectoryPurpose(null), [setDirectoryPurpose]);

  const handleSelect = useCallback(
    (place: V2Place) => {
      if (purpose) {
        // An unavailable place is never a valid start or destination: say so and stay here.
        const usable = purpose === 'start' ? place.isStartRoutable !== false : place.isRoutable !== false;
        if (!usable) {
          Alert.alert(
            'Place unavailable',
            unavailableReasonCopy(place.unavailableReason) ?? `${place.name} is not available on the map yet.`,
          );
          return;
        }
        setDirectoryChoice({ purpose, place });
        setDirectoryPurpose(null);
        goToMap();
        return;
      }
      setPendingDirectorySelection(place);
      goToMap();
    },
    [goToMap, purpose, setDirectoryChoice, setDirectoryPurpose, setPendingDirectorySelection],
  );

  // Android back: dismiss active search/filter state first (mirrors HomeScreen's own
  // SEARCH-mode back behavior), then fall through to the default stack behavior — exit
  // the app at initial launch, or pop back to the map when reopened from there.
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (trimmedQuery.length > 0 || activeCategory) {
        setQuery('');
        setActiveCategory(null);
        return true;
      }
      return false;
    });
    return () => subscription.remove();
  }, [trimmedQuery, activeCategory]);

  const handleCategoryPress = (categoryId: DestinationCategoryId) => {
    setActiveCategory((current) => (current === categoryId ? null : categoryId));
  };

  const renderBrowse = () => {
    const visibleCategories = activeCategory ? categories.filter((c) => c.id === activeCategory) : categories;
    return visibleCategories.map((category) => {
      const places = PublicDestinationsService.getByCategory(category.id);
      return (
        <View key={category.id} style={styles.section}>
          <Text style={styles.sectionTitle} accessibilityRole="header">
            {category.label} ({places.length})
          </Text>
          {category.id === 'blocks' ? (
            <DestinationBlockGrid places={places} onPress={handleSelect} />
          ) : (
            <View style={styles.sectionRows}>
              {places.map((place) => (
                <DestinationRow key={place.id} place={place} onPress={handleSelect} showCategory={false} />
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
      <View style={styles.sectionRows}>
        {searchResults.map((place) => (
          <DestinationRow key={place.id} place={place} onPress={handleSelect} />
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
          onPress={goToMap}
          accessibilityRole="button"
          accessibilityLabel={purpose ? 'Cancel and go back' : 'View map'}
        >
          {purpose ? <X size={18} color={staticColors.info} /> : <MapIcon size={18} color={staticColors.info} />}
          <Text style={styles.viewMapLabel}>{purpose ? 'Cancel' : 'Map'}</Text>
        </Pressable>
      </View>

      <View style={styles.searchWrap}>
        <Search size={18} color={staticColors.iconMuted} style={styles.searchIcon} />
        <SearchBarField
          value={query}
          onChangeText={setQuery}
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
            onPress={() => setQuery('')}
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

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {trimmedQuery.length > 0 ? (
          renderSearchResults()
        ) : (
          <>
            {!activeCategory && recentPlaces.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle} accessibilityRole="header">Recent</Text>
                <View style={styles.sectionRows}>
                  {recentPlaces.map((place) => (
                    <DestinationRow key={place.id} place={place} onPress={handleSelect} />
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
  section: {
    marginTop: spacing.lg,
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
