/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// B7R-3F: React Native 0.81.5 (Fabric, iOS) re-uses a paragraph's old measurement when the next React commit
// clones it after a system font-size change, so the text is drawn at the new scale inside the old frame and
// TextKit can spin forever on short Urdu text. The SDK Text re-keys the native Text when the font scale changes
// so the paragraph is created (and measured) fresh. These tests pin the behaviour: when the native Text is
// replaced, when it is not, and what survives the replacement.

import React, { useState } from 'react';
import { Dimensions, Platform, Pressable, StyleSheet, View } from 'react-native';
import { act, fireEvent, render, screen } from './test-utils';

import { Text } from '@muslim-ummah/offline-navigation/ui';

const WINDOW = { width: 390, height: 844, scale: 3 };
const setWindow = (patch: Partial<typeof WINDOW> & { fontScale: number }) =>
  act(async () => {
    Dimensions.set({ window: { ...WINDOW, ...patch } });
  });

let platformOS: { restore: () => void };
beforeEach(async () => {
  platformOS = jest.replaceProperty(Platform, 'OS', 'ios');
  await setWindow({ fontScale: 1 });
});
afterEach(async () => {
  platformOS.restore();
  await setWindow({ fontScale: 1 });
});

/** A callback ref that records every native Text instance (and every detach) the wrapper hands out. */
function instanceLog() {
  const events: unknown[] = [];
  return { ref: (node: unknown) => void events.push(node), events, attached: () => events.filter(Boolean) };
}

describe('SDK Text: when the native Text is replaced', () => {
  test('is kept across unrelated commits and window changes that leave the font scale alone', async () => {
    const log = instanceLog();
    const { rerender } = await render(<Text ref={log.ref}>one</Text>);
    await rerender(<Text ref={log.ref}>two</Text>);
    await setWindow({ fontScale: 1, width: 320, height: 711 });
    await rerender(<Text ref={log.ref}>three</Text>);
    expect(log.attached()).toHaveLength(1);
    expect(screen.getByText('three')).toBeOnTheScreen();
  });

  test('is replaced by a fresh instance when the font scale changes', async () => {
    const log = instanceLog();
    await render(<Text ref={log.ref}>Block 2</Text>);
    await setWindow({ fontScale: 1.3 });
    const [before, after] = log.attached();
    expect(log.attached()).toHaveLength(2);
    expect(after).not.toBe(before);
    expect(screen.getByText('Block 2')).toBeOnTheScreen();
  });

  test('a later unrelated commit keeps the replacement instead of bringing the old one back', async () => {
    const log = instanceLog();
    const { rerender } = await render(<Text ref={log.ref}>a</Text>);
    await setWindow({ fontScale: 1.3 });
    await rerender(<Text ref={log.ref}>b</Text>);
    await rerender(<Text ref={log.ref}>c</Text>);
    expect(log.attached()).toHaveLength(2);
    expect(screen.getByText('c')).toBeOnTheScreen();
    await setWindow({ fontScale: 1 });
    expect(log.attached()).toHaveLength(3);
    expect(new Set(log.attached()).size).toBe(3);
  });

  test('several font-scale events delivered together cost one replacement', async () => {
    const log = instanceLog();
    await render(<Text ref={log.ref}>rapid</Text>);
    await act(async () => {
      for (const fontScale of [1.15, 1.3, 1.5]) Dimensions.set({ window: { ...WINDOW, fontScale } });
    });
    expect(log.attached()).toHaveLength(2);
  });

  test('every Text in a tree is replaced, including nested Text', async () => {
    const outer = instanceLog();
    const inner = instanceLog();
    await render(
      <Text ref={outer.ref} testID="outer">
        Salam <Text ref={inner.ref} testID="inner" style={{ fontWeight: 'bold' }}>duniya</Text> end
      </Text>,
    );
    expect(screen.getByTestId('outer')).toHaveTextContent('Salam duniya end');
    await setWindow({ fontScale: 1.3 });
    expect(outer.attached()).toHaveLength(2);
    expect(inner.attached()).toHaveLength(2);
    expect(screen.getByTestId('outer')).toHaveTextContent('Salam duniya end');
    expect(StyleSheet.flatten(screen.getByTestId('inner').props.style)).toEqual({ fontWeight: 'bold' });
  });

  test('is left alone when the text opts out of font scaling', async () => {
    const log = instanceLog();
    await render(<Text ref={log.ref} testID="fixed" allowFontScaling={false}>12</Text>);
    await setWindow({ fontScale: 1.3 });
    expect(log.attached()).toHaveLength(1);
    expect(screen.getByTestId('fixed').props.allowFontScaling).toBe(false);
  });

  test('recreates Android paragraphs after native font-layout invalidation', async () => {
    platformOS.restore();
    platformOS = jest.replaceProperty(Platform, 'OS', 'android');
    const log = instanceLog();
    await render(<Text ref={log.ref} testID="android" style={{ fontSize: 18 }}>Android</Text>);
    await setWindow({ fontScale: 1.3 });
    await setWindow({ fontScale: 2 });
    expect(log.attached()).toHaveLength(3);
    expect(screen.getByTestId('android')).toHaveTextContent('Android');
    expect(StyleSheet.flatten(screen.getByTestId('android').props.style)).toEqual({ fontSize: 18 });
  });
});

describe('SDK Text: what survives the replacement', () => {
  test('props, styles and children reach the native Text unchanged', async () => {
    const style = [{ fontSize: 20, color: '#123456' }, { textAlign: 'right' as const }];
    await render(
      <Text testID="t" style={style} numberOfLines={2} ellipsizeMode="tail" selectable maxFontSizeMultiplier={1.5} allowFontScaling>
        Hello
      </Text>,
    );
    const read = () => {
      const { props } = screen.getByTestId('t');
      return {
        style: StyleSheet.flatten(props.style),
        numberOfLines: props.numberOfLines,
        ellipsizeMode: props.ellipsizeMode,
        selectable: props.selectable,
        maxFontSizeMultiplier: props.maxFontSizeMultiplier,
        allowFontScaling: props.allowFontScaling,
      };
    };
    const before = read();
    expect(before).toEqual({
      style: { fontSize: 20, color: '#123456', textAlign: 'right' },
      numberOfLines: 2,
      ellipsizeMode: 'tail',
      selectable: true,
      maxFontSizeMultiplier: 1.5,
      allowFontScaling: true,
    });
    await setWindow({ fontScale: 1.3 });
    expect(read()).toEqual(before);
    expect(screen.getByTestId('t')).toHaveTextContent('Hello');
  });

  test.each([
    ['English', 'Choose a different starting point'],
    ['Urdu', 'اس منزل کے لیے دوسرا ابتدائی مقام منتخب کریں'],
    ['Roman Urdu', 'Is manzil ke liye doosra shuruati maqam chunein'],
  ])('%s text renders before and after a font-scale change', async (_language, label) => {
    const log = instanceLog();
    await render(<Text ref={log.ref} style={{ writingDirection: 'rtl' }}>{label}</Text>);
    expect(screen.getByText(label)).toBeOnTheScreen();
    await setWindow({ fontScale: 1.5 });
    expect(log.attached()).toHaveLength(2);
    expect(screen.getByText(label)).toBeOnTheScreen();
    expect(StyleSheet.flatten(screen.getByText(label).props.style)).toEqual({ writingDirection: 'rtl' });
  });

  test('a pressable Text still responds after the replacement', async () => {
    const onPress = jest.fn();
    await render(<Text onPress={onPress}>Next</Text>);
    await fireEvent.press(screen.getByText('Next'));
    await setWindow({ fontScale: 1.3 });
    await fireEvent.press(screen.getByText('Next'));
    expect(onPress).toHaveBeenCalledTimes(2);
  });

  test('a Text inside a Pressable keeps the button usable and labelled', async () => {
    const onPress = jest.fn();
    await render(
      <Pressable accessibilityRole="button" accessibilityLabel="Next step" onPress={onPress}>
        <Text>Next</Text>
      </Pressable>,
    );
    await setWindow({ fontScale: 1.3 });
    await fireEvent.press(screen.getByRole('button', { name: 'Next step' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test('accessibility props survive and the element stays queryable by role', async () => {
    await render(
      <Text accessible accessibilityRole="header" accessibilityLabel="Route guide" accessibilityHint="Step 2 of 4" accessibilityState={{ selected: true }}>
        Route
      </Text>,
    );
    await setWindow({ fontScale: 1.3 });
    const heading = screen.getByRole('header', { name: 'Route guide' });
    expect(heading.props.accessible).toBe(true);
    expect(heading.props.accessibilityHint).toBe('Step 2 of 4');
    expect(heading.props.accessibilityState).toEqual({ selected: true });
  });

  test('an object ref follows the replacement and is never left null or stale', async () => {
    const ref = React.createRef<React.ElementRef<typeof Text>>();
    await render(<Text ref={ref}>focus me</Text>);
    const before = ref.current;
    expect(before).not.toBeNull();
    await setWindow({ fontScale: 1.3 });
    expect(ref.current).not.toBeNull();
    expect(ref.current).not.toBe(before);
  });

  test('a callback ref is detached from the old instance and attached to the new one', async () => {
    const log = instanceLog();
    await render(<Text ref={log.ref}>focus me</Text>);
    await setWindow({ fontScale: 1.3 });
    expect(log.events).toEqual([expect.anything(), null, expect.anything()]);
    expect(log.events[2]).not.toBe(log.events[0]);
  });

  test('state held by ancestors and siblings is untouched; only Text descendants are replaced', async () => {
    const siblingMounts = jest.fn();
    function Sibling() {
      React.useEffect(() => siblingMounts(), []);
      return <View testID="sibling" />;
    }
    function Stepper() {
      const [step, setStep] = useState(1);
      return (
        <View>
          <Sibling />
          <Text testID="step">{`Step ${step} of 4`}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Next" onPress={() => setStep(step + 1)} />
        </View>
      );
    }
    await render(<Stepper />);
    await fireEvent.press(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByTestId('step')).toHaveTextContent('Step 2 of 4');
    await setWindow({ fontScale: 1.3 });
    expect(screen.getByTestId('step')).toHaveTextContent('Step 2 of 4');
    expect(siblingMounts).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByTestId('step')).toHaveTextContent('Step 3 of 4');
  });
});
