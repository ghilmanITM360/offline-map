/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import { FlatList, Platform, Pressable, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import type { NavigationIcon } from './NavigationScreenTypes';
import { Text } from './Text';

/** One already-named place, as the host presents it. */
export interface PlaceDirectoryItem {
  id: string;
  title: string;
  subtitle?: string;
  searchTerms?: readonly string[];
}

export interface PlaceDirectoryLabels {
  searchLabel: string;
  searchPlaceholder: string;
  /** There is nothing to list. */
  empty: string;
  noMatches: (query: string) => string;
}

/** The host's design system: the row icons and colour tokens. */
export interface PlaceDirectoryTheme {
  PlaceIcon: NavigationIcon;
  /** Already chosen for the reading direction: points to the end edge. */
  ForwardIcon: NavigationIcon;
  colors: { fill: string; border: string; pressed: string; iconDisc: string; brand: string; headingText: string; secondaryText: string };
}

export interface PlaceDirectoryProps {
  items: readonly PlaceDirectoryItem[];
  query: string;
  onQueryChange: (query: string) => void;
  onSelect: (id: string) => void;
  labels: PlaceDirectoryLabels;
  isRTL: boolean;
  theme: PlaceDirectoryTheme;
  /** Content that scrolls away with the list, above the search field (large text: the screen's own header). */
  header?: React.ReactNode;
}

/** Case, width and composition-insensitive text for matching; never changes what is displayed. */
export function normalizeSearchText(text: string): string {
  return text.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
}

/** Every word the user typed must appear somewhere in the place's title, subtitle or search terms. */
export function filterPlaceItems<T extends PlaceDirectoryItem>(items: readonly T[], query: string): T[] {
  const words = normalizeSearchText(query).split(' ').filter(Boolean);
  if (words.length === 0) return [...items];
  return items.filter((item) => {
    const haystack = normalizeSearchText([item.title, item.subtitle ?? '', ...(item.searchTerms ?? [])].join(' '));
    return words.every((word) => haystack.includes(word));
  });
}

const TARGET = 48;
const INPUT_FONT_SIZE = 16;

// Presentation only: the host owns the places, their names and what choosing one does.
export function PlaceDirectory({ items, query, onQueryChange, onSelect, labels, isRTL, theme, header }: PlaceDirectoryProps) {
  const { fontScale } = useWindowDimensions();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const visible = useMemo(() => filterPlaceItems(items, query), [items, query]);
  const { PlaceIcon, ForwardIcon, colors } = theme;
  const text = { textAlign: 'auto' as const, writingDirection: isRTL ? 'rtl' as const : 'ltr' as const };
  const emptyMessage = items.length === 0 ? labels.empty : labels.noMatches(query.trim());
  // Found on an iPhone simulator: after a Dynamic Type change a TextInput keeps drawing at the OLD system scale (a re-created one too), so on iOS
  // the field is scaled here from the window's current font scale instead. It still follows the system size; nothing is clipped or capped.
  const manualScale = Platform.OS === 'ios';
  const input = (
    <TextInput
      allowFontScaling={!manualScale}
      value={query}
      onChangeText={onQueryChange}
      accessibilityLabel={labels.searchLabel}
      placeholder={labels.searchPlaceholder}
      placeholderTextColor={colors.secondaryText}
      returnKeyType="search"
      autoCorrect={false}
      clearButtonMode="while-editing"
      style={[styles.input, manualScale && { fontSize: INPUT_FONT_SIZE * fontScale }, text]}
    />
  );
  return (
    <View testID="place-directory" style={styles.root}>
      {header ? null : input}
      <FlatList
        data={visible}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.list}
        ListHeaderComponent={header ? <View style={styles.headerStack}>{header}{input}</View> : undefined}
        ListEmptyComponent={<Text accessibilityLiveRegion="polite" style={[styles.empty, text]}>{emptyMessage}</Text>}
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            onPress={() => onSelect(item.id)}
            accessibilityRole="button"
            accessibilityLabel={item.subtitle ? `${item.title}. ${item.subtitle}` : item.title}
          >
            <View style={styles.disc}><PlaceIcon size={22} color={colors.brand} /></View>
            <View style={styles.flex}>
              <Text style={[styles.title, text]}>{item.title}</Text>
              {item.subtitle ? <Text style={[styles.subtitle, text]}>{item.subtitle}</Text> : null}
            </View>
            <ForwardIcon size={20} color={colors.secondaryText} />
          </Pressable>
        )}
      />
    </View>
  );
}

const makeStyles = ({ colors }: PlaceDirectoryTheme) => StyleSheet.create({
  flex: { flex: 1 },
  root: { flexShrink: 1, gap: 8 },
  input: {
    minHeight: TARGET, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.fill,
    paddingHorizontal: 14, paddingVertical: 8, fontSize: INPUT_FONT_SIZE, color: colors.headingText,
  },
  list: { gap: 8, paddingBottom: 8 },
  headerStack: { gap: 8 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: TARGET + 8, borderRadius: 14, borderWidth: 1,
    borderColor: colors.border, backgroundColor: colors.fill, paddingHorizontal: 12, paddingVertical: 8,
  },
  rowPressed: { backgroundColor: colors.pressed },
  disc: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.iconDisc, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 17, fontWeight: '700', color: colors.headingText },
  subtitle: { fontSize: 14, lineHeight: 20, color: colors.secondaryText },
  empty: { fontSize: 16, lineHeight: 22, color: colors.secondaryText, paddingVertical: 12 },
});
