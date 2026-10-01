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
  // so the prop and the field's accessibility name (the hint itself, unless a caller passes a label) are unchanged.
  const showHint = typeof placeholder === 'string' && placeholder.length > 0 && value === '';
  const flat: TextStyle = StyleSheet.flatten([styles.input, style]) ?? {};
  const num = (value: unknown, fallback: number) => (typeof value === 'number' ? value : fallback);
  const border = num(flat.borderWidth, 0);
  const hintLeft = num(flat.paddingLeft ?? flat.paddingHorizontal, spacing.lg) + border;
  const hintRight = num(flat.paddingRight ?? flat.paddingHorizontal, spacing.lg) + border;
  return (
    <View>
      <TextInput
        ref={ref}
        style={[styles.input, style]}
        value={value}
        placeholder={placeholder}
        accessibilityLabel={accessibilityLabel}
        returnKeyType="search"
        maxFontSizeMultiplier={1.8}
        {...props}
        // After the spread so a caller cannot un-hide the native hint underneath the overlay.
        placeholderTextColor={showHint ? 'transparent' : props.placeholderTextColor ?? staticColors.textMuted}
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
            { left: hintLeft, right: hintRight },
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
    // textAlignVertical is Android-only; this centres the line on iOS too.
    justifyContent: 'center',
  },
});
