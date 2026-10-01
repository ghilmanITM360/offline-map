/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { forwardRef } from 'react';
import { StyleSheet, Text, TextInput, TextInputProps, TextStyle, View } from 'react-native';

import { radii, spacing, staticColors } from '../../../theme';

/**
 * Shared search-input row geometry (Phase 8A task 7) — height/radius/typography match
 * HomeScreen's main search bar (`styles.searchInput`, height 52) exactly. LocationSheet's
 * manual-start search (previously its own ad hoc `searchInput` style) now renders this.
 * HomeScreen's bar keeps its own Animated.View wrapper for the focus-ring animation —
 * only wrapping chrome differs, the field itself is this shared component.
 */
export const SearchBarField = forwardRef<TextInput, TextInputProps>(function SearchBarField(
  { style, placeholder, value, accessibilityLabel, ...props },
  ref,
) {
  // Android draws a TextInput's native hint itself: at 200% font on a 320 dp window it wrapped onto a second
  // line that this fixed-height field clipped, and it cannot ellipsize (#128 A). While the (controlled) field is
  // empty the visible hint is a one-line Text that ends in an ellipsis; the native placeholder stays, transparent,
  // so the prop and the field's name are unchanged.
  const showHint = typeof placeholder === 'string' && placeholder.length > 0 && value === '';
  const flat: TextStyle = StyleSheet.flatten([styles.input, style]) ?? {};
  return (
    <View>
      <TextInput
        ref={ref}
        style={[styles.input, style]}
        value={value}
        placeholder={placeholder}
        placeholderTextColor={showHint ? 'transparent' : staticColors.textMuted}
        accessibilityLabel={accessibilityLabel ?? placeholder}
        returnKeyType="search"
        maxFontSizeMultiplier={1.8}
        {...props}
      />
      {showHint && (
        <Text
          numberOfLines={1}
          ellipsizeMode="tail"
          maxFontSizeMultiplier={1.8}
          pointerEvents="none"
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          // Same insets as the field's own text (callers add icon/clear-button room through paddingLeft/Right);
          // left/right swap together in RTL, exactly as the TextInput's padding does.
          style={[
            styles.hint,
            { left: flat.paddingLeft ?? flat.paddingHorizontal ?? spacing.lg, right: flat.paddingRight ?? flat.paddingHorizontal ?? spacing.lg },
          ]}
        >
          {placeholder}
        </Text>
      )}
    </View>
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
  hint: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    fontSize: 16,
    color: staticColors.textMuted,
    textAlignVertical: 'center',
  },
});
