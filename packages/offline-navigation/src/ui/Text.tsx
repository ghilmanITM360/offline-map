/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React from 'react';
import { Platform, Text as NativeText, useWindowDimensions, type TextProps } from 'react-native';

export type TextRef = React.ElementRef<typeof NativeText>;

/**
 * Drop-in for react-native's Text that survives a system font-size change on iOS.
 *
 * React Native 0.81 (Fabric) clones a paragraph with its OLD measurement when the next React commit follows a
 * Dynamic Type change, so the text is drawn at the new scale inside the old frame and TextKit can spin forever on
 * short Urdu text (facebook/react-native#57512, fixed upstream in 0.87). Keying the native Text on the font scale
 * makes React create the paragraph fresh, so it is measured at the current scale. Scaling stays on; nothing is clipped.
 *
 * Only the native Text (and any Text inside it) is replaced: ancestors and siblings keep their state. Text that opts
 * out of font scaling, and every platform other than iOS, keep a stable key and render exactly as react-native's Text.
 * TextInput and third-party Text are not covered.
 */
export function Text({ ref, ...props }: TextProps & { ref?: React.Ref<TextRef> }) {
  const { fontScale } = useWindowDimensions();
  const keyed = Platform.OS === 'ios' && props.allowFontScaling !== false;
  return <NativeText key={keyed ? fontScale : undefined} ref={ref} {...props} />;
}
