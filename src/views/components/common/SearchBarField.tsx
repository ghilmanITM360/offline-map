/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { forwardRef } from 'react';
import { StyleSheet, TextInput, TextInputProps } from 'react-native';

import { radii, spacing, staticColors } from '../../../theme';

/**
 * Shared search-input row geometry (Phase 8A task 7) — height/radius/typography match
 * HomeScreen's main search bar (`styles.searchInput`, height 52) exactly. LocationSheet's
 * manual-start search (previously its own ad hoc `searchInput` style) now renders this.
 * HomeScreen's bar keeps its own Animated.View wrapper for the focus-ring animation —
 * only wrapping chrome differs, the field itself is this shared component.
 */
export const SearchBarField = forwardRef<TextInput, TextInputProps>(function SearchBarField(
  { style, ...props },
  ref,
) {
  return (
    <TextInput
      ref={ref}
      style={[styles.input, style]}
      placeholderTextColor={staticColors.textMuted}
      returnKeyType="search"
      {...props}
    />
  );
});

export const SEARCH_BAR_HEIGHT = 52;

const styles = StyleSheet.create({
  input: {
    height: SEARCH_BAR_HEIGHT,
    borderWidth: 1,
    borderColor: staticColors.border,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    fontSize: 16,
    color: staticColors.textPrimary,
    backgroundColor: staticColors.white,
    textAlignVertical: 'center',
  },
});
