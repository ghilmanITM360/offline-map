/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { useEffect, useRef } from 'react';
import { AccessibilityInfo } from 'react-native';
import type { TextRef } from './Text';

/** Focus a mounted heading once per visible journey stage. Copy/locale updates never steal focus. */
export function useAccessibilityFocus(stage: string | null) {
  const ref = useRef<TextRef | null>(null);
  useEffect(() => {
    if (stage === null) return;
    const frame = requestAnimationFrame(() => {
      if (ref.current) AccessibilityInfo.sendAccessibilityEvent(ref.current, 'focus');
    });
    return () => cancelAnimationFrame(frame);
  }, [stage]);
  return { ref };
}
