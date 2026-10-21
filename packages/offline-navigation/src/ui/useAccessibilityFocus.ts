/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Text } from 'react-native';

/** Focus a mounted heading once per visible journey stage. Copy/locale updates never steal focus. */
export function useAccessibilityFocus(stage: string | null) {
  const ref = useRef<React.ElementRef<typeof Text> | null>(null);
  useEffect(() => {
    if (stage === null) return;
    const frame = requestAnimationFrame(() => {
      if (ref.current) AccessibilityInfo.sendAccessibilityEvent(ref.current, 'focus');
    });
    return () => cancelAnimationFrame(frame);
  }, [stage]);
  return { ref };
}
