/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useRef } from 'react';
import { Animated } from 'react-native';
import { useReducedMotion } from './useReducedMotion';

/** Native adaptation of a subtle press/selection-feedback micro-interaction — spring-
 * scales down on press, back up on release. Mirrors the pattern already used in
 * PermissionScreen/DownloadMapScreen's primary buttons; pulled out here so
 * LocationsDirectoryScreen's several pressables (rows, tiles, chips) share one
 * implementation instead of re-deriving it. Respects the OS reduce-motion setting. */
export function usePressScale(scaleTo = 0.96) {
  const reducedMotion = useReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;

  const onPressIn = () => {
    if (reducedMotion) return;
    Animated.spring(scale, { toValue: scaleTo, useNativeDriver: true, friction: 6, tension: 200 }).start();
  };
  const onPressOut = () => {
    if (reducedMotion) return;
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 4, tension: 140 }).start();
  };

  return { scale, onPressIn, onPressOut };
}
