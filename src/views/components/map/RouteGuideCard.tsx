/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useAppStore, type RouteGuideState } from '../../../store/useAppStore';
import { Button } from '../common/Button';
import { directionsSheetColors, radii } from '../../../theme';
import { InstructionService } from '../../../services/InstructionService';

// The Route Guide card (#307). The user reads the steps and moves through them; the app does not know where
// they are, so nothing here may claim live movement, progress, rerouting or arrival.
export function RouteGuideCard({
  guide,
  onPrevious,
  onNext,
  onLive,
  onEnd,
  liveBusy,
  message,
}: {
  guide: RouteGuideState;
  onPrevious: () => void;
  onNext: () => void;
  onLive: () => void;
  onEnd: () => void;
  liveBusy?: boolean;
  /** One plain sentence when a live attempt could not start. */
  message?: string | null;
}) {
  const distanceUnit = useAppStore((s) => s.settings.distanceUnit);
  // Same threshold as the Directions footer: side by side, "Previous" splits mid-word at large text on a narrow window.
  const stacked = useWindowDimensions().fontScale >= 1.5;
  const { steps, stepIndex } = guide;
  const step = steps[stepIndex];
  const atStart = stepIndex === 0;
  const atEnd = stepIndex === steps.length - 1;
  const distance = step.distanceM > 0 ? InstructionService.formatDistance(step.distanceM, distanceUnit) : null;

  return (
    <View style={styles.card}>
      <View style={styles.step} accessible accessibilityLiveRegion="polite"
        accessibilityLabel={`Step ${stepIndex + 1} of ${steps.length}. ${step.text}${distance ? `, ${distance}` : ''}`}>
        <Text style={styles.stepCount}>{`Step ${stepIndex + 1} of ${steps.length}`}</Text>
        <Text style={styles.stepText}>{step.text}</Text>
        {distance ? <Text style={styles.stepDistance}>{distance}</Text> : null}
      </View>

      <View testID="guide-stepper" style={[styles.stepper, stacked && styles.stepperStacked]}>
        <Button
          variant="brandTint"
          fullWidth={false}
          style={styles.stepperButton}
          label="Previous"
          accessibilityLabel="Previous step"
          icon={<ChevronLeft size={20} color={directionsSheetColors.brand} />}
          disabled={atStart}
          onPress={onPrevious}
        />
        <Button
          variant="brand"
          fullWidth={false}
          style={styles.stepperButton}
          label="Next"
          accessibilityLabel="Next step"
          trailingIcon={<ChevronRight size={20} color={directionsSheetColors.brandText} />}
          disabled={atEnd}
          onPress={onNext}
        />
      </View>

      <Pressable style={styles.link} onPress={onLive} disabled={liveBusy} accessibilityRole="button"
        accessibilityLabel="Use my location for live guidance">
        <Text style={styles.linkText}>{liveBusy ? 'Finding your location…' : 'Use my location for live guidance'}</Text>
      </Pressable>
      {message ? <Text accessibilityLiveRegion="polite" style={styles.caption}>{message}</Text> : null}
      <Pressable style={styles.link} onPress={onEnd} accessibilityRole="button" accessibilityLabel="End route guide">
        <Text style={styles.endText}>End route guide</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 8 },
  caption: { fontSize: 13, lineHeight: 18, color: directionsSheetColors.secondaryText },
  step: {
    gap: 2,
    padding: 12,
    borderRadius: radii.xl,
    backgroundColor: directionsSheetColors.innerCardFill,
    borderWidth: 1,
    borderColor: directionsSheetColors.innerCardBorder,
  },
  stepCount: { fontSize: 13, fontWeight: '700', color: directionsSheetColors.secondaryText },
  stepText: { fontSize: 20, lineHeight: 26, fontWeight: '800', color: directionsSheetColors.headingText },
  stepDistance: { fontSize: 15, color: directionsSheetColors.secondaryText },
  stepper: { flexDirection: 'row', gap: 10 },
  stepperStacked: { flexDirection: 'column' },
  stepperButton: { flex: 1, borderRadius: radii.xl },
  link: { alignSelf: 'flex-start', minHeight: 48, justifyContent: 'center', paddingHorizontal: 4 },
  linkText: { fontSize: 16, fontWeight: '800', color: directionsSheetColors.brand },
  endText: { fontSize: 16, fontWeight: '700', color: directionsSheetColors.secondaryText },
});
