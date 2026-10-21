import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View, type StyleProp, type ViewStyle } from 'react-native';

/** The current manual step, already localized and formatted by the host. */
export interface RouteGuideCardStep {
  instruction: string;
  /** Formatted distance, or null when the step has none. */
  distance: string | null;
}

/** Resolved copy; the host owns language and wording. */
export interface RouteGuideCardLabels {
  stepCount: (step: number, total: number) => string;
  stepSummary: (count: string, instruction: string, distance: string | null) => string;
  previous: string;
  previousStep: string;
  next: string;
  nextStep: string;
  useLocation: string;
  acquiring: string;
  end: string;
}

/** The host's design system: buttons, direction-aware chevrons and colour tokens. */
export interface RouteGuideCardTheme {
  Button: React.ComponentType<{
    label?: string;
    variant?: 'brand' | 'brandTint';
    fullWidth?: boolean;
    style?: StyleProp<ViewStyle>;
    accessibilityLabel?: string;
    icon?: React.ReactNode;
    trailingIcon?: React.ReactNode;
    disabled?: boolean;
    onPress?: () => void;
  }>;
  /** Chevrons already chosen for the reading direction: back points to the start edge, forward to the end edge. */
  BackIcon: React.ComponentType<{ size?: number; color?: string }>;
  ForwardIcon: React.ComponentType<{ size?: number; color?: string }>;
  colors: { brand: string; brandText: string; headingText: string; secondaryText: string; innerCardFill: string; innerCardBorder: string };
  radius: number;
}

export interface RouteGuideCardProps {
  step: RouteGuideCardStep;
  /** Zero-based. */
  stepIndex: number;
  stepTotal: number;
  onPrevious: () => void;
  onNext: () => void;
  /** Omitted when live guidance cannot help. */
  onLive?: () => void;
  onEnd: () => void;
  liveBusy?: boolean;
  /** One plain sentence when a live attempt could not start. */
  message?: string | null;
  labels: RouteGuideCardLabels;
  isRTL: boolean;
  theme: RouteGuideCardTheme;
}

// Presentation only: the user reads the steps and moves through them; nothing here may claim live movement,
// progress, rerouting or arrival. The host owns the step index, live attempts and ending the guide.
export function RouteGuideCard({ step, stepIndex, stepTotal, onPrevious, onNext, onLive, onEnd, liveBusy, message, labels, isRTL, theme }: RouteGuideCardProps) {
  const styles = useMemo(() => makeStyles(theme), [theme]);
  // Same threshold as the Directions footer: side by side, "Previous" splits mid-word at large text on a narrow window.
  const stacked = useWindowDimensions().fontScale >= 1.5;
  const { Button, BackIcon, ForwardIcon } = theme;
  const atStart = stepIndex === 0;
  const atEnd = stepIndex === stepTotal - 1;
  const count = labels.stepCount(stepIndex + 1, stepTotal);
  return (
    <View testID="route-guide-card" style={[styles.card, { direction: isRTL ? 'rtl' : 'ltr' }]}>
      <View style={styles.step} accessible accessibilityLiveRegion="polite"
        accessibilityLabel={labels.stepSummary(count, step.instruction, step.distance)}>
        <Text style={styles.stepCount}>{count}</Text>
        <Text style={styles.stepText}>{step.instruction}</Text>
        {step.distance ? <Text style={styles.stepDistance}>{step.distance}</Text> : null}
      </View>

      <View testID="guide-stepper" style={[styles.stepper, stacked && styles.stepperStacked]}>
        <Button
          variant="brandTint"
          fullWidth={false}
          style={styles.stepperButton}
          label={labels.previous}
          accessibilityLabel={labels.previousStep}
          icon={<BackIcon size={20} color={theme.colors.brand} />}
          disabled={atStart}
          onPress={onPrevious}
        />
        <Button
          variant="brand"
          fullWidth={false}
          style={styles.stepperButton}
          label={labels.next}
          accessibilityLabel={labels.nextStep}
          trailingIcon={<ForwardIcon size={20} color={theme.colors.brandText} />}
          disabled={atEnd}
          onPress={onNext}
        />
      </View>

      {onLive && (
        <Pressable style={styles.link} onPress={onLive} disabled={liveBusy} accessibilityRole="button"
          accessibilityLabel={labels.useLocation}>
          <Text style={styles.linkText}>{liveBusy ? labels.acquiring : labels.useLocation}</Text>
        </Pressable>
      )}
      {message ? <Text accessibilityLiveRegion="polite" style={styles.caption}>{message}</Text> : null}
      <Pressable style={styles.link} onPress={onEnd} accessibilityRole="button" accessibilityLabel={labels.end}>
        <Text style={styles.endText}>{labels.end}</Text>
      </Pressable>
    </View>
  );
}

const makeStyles = ({ colors, radius }: RouteGuideCardTheme) => StyleSheet.create({
  card: { gap: 8 },
  caption: { fontSize: 13, lineHeight: 18, color: colors.secondaryText },
  step: {
    gap: 2,
    padding: 12,
    borderRadius: radius,
    backgroundColor: colors.innerCardFill,
    borderWidth: 1,
    borderColor: colors.innerCardBorder,
  },
  stepCount: { fontSize: 13, fontWeight: '700', color: colors.secondaryText },
  stepText: { fontSize: 20, lineHeight: 26, fontWeight: '800', color: colors.headingText },
  stepDistance: { fontSize: 15, color: colors.secondaryText },
  stepper: { flexDirection: 'row', gap: 10 },
  stepperStacked: { flexDirection: 'column' },
  stepperButton: { flex: 1, borderRadius: radius },
  link: { alignSelf: 'flex-start', minHeight: 48, justifyContent: 'center', paddingHorizontal: 4 },
  linkText: { fontSize: 16, fontWeight: '800', color: colors.brand },
  endText: { fontSize: 16, fontWeight: '700', color: colors.secondaryText },
});
