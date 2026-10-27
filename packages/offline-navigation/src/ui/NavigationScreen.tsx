/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { ArrivalCard } from './ArrivalCard';
import { DirectionsHeader } from './DirectionsHeader';
import { GateChooser } from './GateChooser';
import { GpsSignalBanner } from './GpsSignalBanner';
import { ManualLiveUpgradeCard, type ManualLiveUpgradeCardLabels } from './ManualLiveUpgradeCard';
import { MapUnavailableBanner } from './MapUnavailableBanner';
import type { NavigationMapHandle, NavigationScreenProps, NavigationScreenTheme } from './NavigationScreenTypes';
import { useNavigationController, useNavigationState } from './NavigationProvider';
import { PlaceDirectory, type PlaceDirectoryItem } from './PlaceDirectory';
import { RerouteBanner } from './RerouteBanner';
import { RerouteProgressCard } from './RerouteProgressCard';
import { RouteEndpointRows } from './RouteEndpointRows';
import { RouteGuideCard, RouteGuideLinks, RouteGuideStep, RouteGuideStepper } from './RouteGuideCard';
import { describeRouteStep, formatDistance } from './RouteStepCopy';
import { StartOptionCard } from './StartOptionCard';
import { Text } from './Text';
import { useSafetyAnnouncements } from './useSafetyAnnouncements';

type PickerKind = 'origin' | 'destination';

// From this system font scale the panel changes shape: the directory header scrolls with its list, and the step controls and Exit stay
// pinned under the scrolling content (Previous / Next in the guide, End navigation while live; the guide's End link follows the step text),
// so the controls are never buried below a screen of enlarged text. Scaling itself stays on.
export const LARGE_TEXT_SCALE = 1.3;
// Headings repeat what the rows already say, so they stop growing here; instructions, rows and buttons keep scaling fully.
export const HEADING_MAX_FONT_SCALE = 1.8;

const AUTOMATIC_GATE = '\u0000automatic'; // never a real gate id: ids are non-empty text without control characters

type Stage = { body: React.ReactNode; footer?: React.ReactNode; scroll: boolean };

// Each leaf has its own small theme type. The screen takes ONE theme and derives them, so a host styles one object.
function deriveLeafThemes({ colors, icons, Button, radius, hitSlop }: NavigationScreenTheme) {
  const info = { fill: colors.infoFill, border: colors.infoBorder, text: colors.infoText };
  const Card = ({ children }: { children?: React.ReactNode }) => (
    <View style={{ borderRadius: radius, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceMuted, padding: 14 }}>{children}</View>
  );
  return {
    header: { BackIcon: icons.Back, colors: { headingText: colors.text, secondaryText: colors.textSecondary, backButtonFill: colors.brandTint } },
    rows: {
      ForwardIcon: icons.Forward,
      colors: { cardBorder: colors.border, cardFill: colors.surface, iconDisc: colors.brandTint, headingText: colors.text, secondaryText: colors.textSecondary, pressedFill: colors.pressed },
    },
    option: {
      ForwardIcon: icons.Forward,
      LoadingIcon: icons.Loading,
      colors: {
        optionFill: colors.surface, optionBorder: colors.border, optionSelectedFill: colors.brandTint, optionSelectedBorder: colors.brand,
        pressedFill: colors.pressed, iconDisc: colors.brandTint, iconDiscSolid: colors.brand, headingText: colors.text,
        secondaryText: colors.textSecondary, brand: colors.brand, brandText: colors.onBrand,
      },
    },
    guide: {
      Button, BackIcon: icons.Back, ForwardIcon: icons.Forward, radius,
      colors: { brand: colors.brand, brandText: colors.onBrand, headingText: colors.text, secondaryText: colors.textSecondary, innerCardFill: colors.surfaceMuted, innerCardBorder: colors.border },
    },
    upgrade: { Card, Button, text: { color: colors.text, fontSize: 16, lineHeight: 22 }, spinnerColor: colors.brand, gap: 10 },
    gps: { colors: { fill: colors.warningFill, text: colors.warningText } },
    gates: {
      // The chooser's two variants map onto the screen's one Button.
      Button: function GateButton({ variant, ...rest }: { label: string; accessibilityLabel: string; variant: 'secondary' | 'outline'; disabled?: boolean; selected?: boolean; onPress: () => void }) {
        return <Button {...rest} variant={variant === 'secondary' ? 'brandTint' : 'outline'} />;
      },
      colors: { fill: colors.surfaceMuted, border: colors.border, title: colors.text },
    },
    notice: { colors: info },
    mapBanner: { colors: info },
    rerouting: { colors: { fill: colors.brand, text: colors.onBrand } },
    arrival: {
      PinIcon: icons.Pin, RecenterIcon: icons.Recenter, hitSlop,
      colors: { scrim: colors.scrim, cardFill: colors.surface, title: colors.text, accent: colors.brand, onAccent: colors.onBrand, muted: colors.textSecondary, secondaryFill: colors.brandTint, secondaryText: colors.text },
    },
    directory: {
      PlaceIcon: icons.Place, ForwardIcon: icons.Forward,
      colors: { fill: colors.surface, border: colors.border, pressed: colors.pressed, iconDisc: colors.brandTint, brand: colors.brand, headingText: colors.text, secondaryText: colors.textSecondary },
    },
  };
}

// The ready-made screen. It owns no navigation state: the NavigationProvider's controller decides the phase, route,
// step and live status, and every button below is one controller command. What lives here is view-local only: the
// search text, which chooser is open, the Manual-to-Live confirmation and whether the host's map said it is unavailable.
export function NavigationScreen({
  copy, theme, isRTL, describePlace, MapComponent, allowLive = true, reviewLiveRoute = true, bottomInset = 0, arrivalBottomInset, onClose, onTripEnded, style,
}: NavigationScreenProps) {
  const controller = useNavigationController();
  const state = useNavigationState();
  const mapRef = useRef<NavigationMapHandle | null>(null);
  const [query, setQuery] = useState('');
  // Both are tied to a trip (session id), so a trip changed behind the screen's back can never leave them stale.
  const [picker, setPicker] = useState<{ kind: PickerKind; sessionId: string | null } | null>(null);
  const [confirmSession, setConfirmSession] = useState<string | null>(null);
  const [mapAvailable, setMapAvailable] = useState(true);
  const leaf = useMemo(() => deriveLeafThemes(theme), [theme]);
  const { colors, icons, Button } = theme;
  const large = useWindowDimensions().fontScale >= LARGE_TEXT_SCALE;

  const places = controller.listPlaces();
  const presented = useMemo(() => {
    const titles = new Map<string, string>();
    const items: PlaceDirectoryItem[] = [];
    for (const place of places) {
      const named = describePlace ? describePlace(place) : { title: place.id };
      if (!named) continue;
      titles.set(place.id, named.title);
      items.push({ id: place.id, ...named });
    }
    return { titles, items };
  }, [places, describePlace]);
  const titleOf = (id: string | null) => (id === null ? '' : presented.titles.get(id) ?? id);

  const { phase, destinationId, route, liveAttempt, live } = state;
  const destination = titleOf(destinationId);
  const activePicker = phase !== 'browsing' && picker?.sessionId === state.sessionId ? picker.kind : null;
  const confirming = phase === 'guide' && confirmSession === state.sessionId && allowLive;
  const direction = isRTL ? 'rtl' : 'ltr';
  // `textAlign: 'auto'` follows the paragraph direction. An explicit left/right is flipped again by the platform once
  // writingDirection is rtl, which put RTL text on the wrong edge on both Android and iOS.
  const text = { textAlign: 'auto' as const, writingDirection: isRTL ? 'rtl' as const : 'ltr' as const };
  const styles = useMemo(() => makeStyles(theme), [theme]);

  // iOS has no live regions, so VoiceOver is told about GPS loss/recovery, reroutes and each new instruction explicitly (Android keeps the live regions).
  const liveStep = phase === 'live' && route && live ? route.steps[state.stepIndex] : undefined;
  const spoken = liveStep ? describeRouteStep(liveStep, copy.routeStep, destination) : null;
  const spokenDistance = liveStep && live && liveStep.kind !== 'arrive' ? formatDistance(live.maneuverDistanceM, copy.routeStep) : null;
  useSafetyAnnouncements({
    active: liveStep !== undefined,
    signal: live?.signal ?? 'good',
    rerouting: live?.rerouting ?? false,
    notice: live?.notice ?? null,
    instructionKey: `${state.sessionId}#${route?.nodeIds.length ?? 0}:${route?.distanceM ?? 0}#${state.stepIndex}`,
    instruction: spoken ? (spokenDistance ? `${spoken.instruction}. ${spokenDistance}` : spoken.instruction) : '',
    copy: { ...copy.live, signalRecovered: copy.live.gpsRecovered },
  });

  const closePicker = () => { setPicker(null); setQuery(''); };
  const openPicker = (kind: PickerKind) => { setQuery(''); setPicker({ kind, sessionId: state.sessionId }); };
  const choose = (id: string) => {
    const kind = activePicker ?? 'destination';
    closePicker();
    if (kind === 'origin') controller.selectOrigin(id);
    else controller.selectDestination(id);
  };
  const endTrip = (reason: 'exit' | 'arrived') => {
    controller.exit();
    onTripEnded?.(reason);
  };
  const recenter = () => mapRef.current?.recenter();
  const retry = () => {
    if (state.originId !== null) controller.selectOrigin(state.originId);
    else if (destinationId !== null) controller.selectDestination(destinationId);
  };
  const blockerMessage = liveAttempt.status === 'blocked' && liveAttempt.blocker ? copy.liveBlockers[liveAttempt.blocker] : null;
  const requesting = liveAttempt.status === 'requesting';
  const candidate = state.liveCandidate;
  // The walker sees the live route and starts it with a second tap (what the Ijtema host does); `reviewLiveRoute={false}` starts in one tap.
  const startLive = () => void (reviewLiveRoute ? controller.prepareLive() : controller.requestLive());

  // ---- the panel, one stage at a time ----

  const directory = () => {
    const kind: PickerKind = activePicker ?? 'destination';
    const browsing = phase === 'browsing';
    const origin = kind === 'origin';
    const onBack = browsing ? onClose : closePicker;
    const title = origin ? copy.directory.originTitle : copy.directory.destinationTitle;
    const listed = presented.items.filter((item) => item.id !== destinationId);
    const header = onBack ? (
      <DirectionsHeader
        title={title}
        subtitle={origin ? copy.directory.originSubtitle : copy.directory.destinationSubtitle}
        onBack={onBack}
        focusKey={`directory:${kind}`}
        backLabel={copy.directory.back}
        isRTL={isRTL}
        theme={leaf.header}
        maxTitleFontScale={HEADING_MAX_FONT_SCALE}
      />
    ) : (
      <View style={styles.plainHeader}>
        <Text accessibilityRole="header" maxFontSizeMultiplier={HEADING_MAX_FONT_SCALE} style={[styles.plainTitle, text]}>{title}</Text>
        <Text style={[styles.subtitle, text]}>{origin ? copy.directory.originSubtitle : copy.directory.destinationSubtitle}</Text>
      </View>
    );
    const error = browsing && state.error ? <Text accessibilityLiveRegion="polite" style={[styles.subtitle, text, large && styles.bleedPad]}>{copy.trip.errors[state.error]}</Text> : null;
    const places = (
      <PlaceDirectory
        items={browsing ? presented.items : listed}
        query={query}
        onQueryChange={setQuery}
        onSelect={choose}
        labels={copy.directory}
        isRTL={isRTL}
        theme={leaf.directory}
        header={large ? <View style={styles.headerBleed}>{header}{error}</View> : undefined}
      />
    );
    // Large text: the header is part of the list's own scroll, so the places can always be reached.
    if (large) return <View style={styles.directoryLarge}>{places}</View>;
    return (
      <>
        {header}
        <View style={styles.directory}>
          {error}
          {places}
        </View>
      </>
    );
  };

  // The gates are the host's outside-route provider's; the screen only lists them and passes the choice on. A gate the provider does not list
  // cannot be chosen (the controller ignores it), so a gate with no connection never appears here.
  const gates = controller.listEntryGates();
  const entryGates = (visible: boolean) => {
    const gateCopy = copy.entryGate;
    if (!visible || !gateCopy || gates.length === 0) return null;
    return (
      <View testID="entry-gate-chooser" style={styles.gateBleed}>
        <GateChooser
          title={gateCopy.title}
          options={[
            { id: AUTOMATIC_GATE, label: gateCopy.automatic, accessibilityLabel: gateCopy.automaticA11y },
            ...gates.map((gate) => ({ id: gate.id, label: gate.label, accessibilityLabel: gateCopy.option(gate.label) })),
          ]}
          selectedId={state.entryGateId ?? AUTOMATIC_GATE}
          onSelect={(id) => controller.selectEntryGate(id === AUTOMATIC_GATE ? null : id)}
          theme={leaf.gates}
        />
      </View>
    );
  };

  const liveOption = () => (
    <>
      <StartOptionCard
        icon={<icons.Location size={24} color={colors.brand} />}
        title={copy.trip.startLive.title}
        subtitle={requesting ? copy.trip.startLive.busy : copy.trip.startLive.subtitle}
        loading={requesting}
        disabled={state.loadState === 'loading' || requesting}
        onPress={startLive}
        theme={leaf.option}
      />
      {blockerMessage ? <Text testID="navigation-live-message" accessibilityLiveRegion="polite" style={[styles.subtitle, text]}>{blockerMessage}</Text> : null}
    </>
  );

  const preview = () => {
    const { loadState } = state;
    const ready = loadState === 'ready' && route !== null;
    const originName = state.originId === null ? null : titleOf(state.originId);
    const status = loadState === 'needs_origin' ? copy.trip.needsOrigin
      : loadState === 'same_place' ? copy.trip.samePlace
      : loadState === 'error' && state.error ? copy.trip.errors[state.error] : null;
    return (
      <>
        <DirectionsHeader
          title={copy.trip.title(destination)}
          subtitle={ready ? copy.trip.summary(formatDistance(route.distanceM, copy.routeStep) ?? '') : ''}
          onBack={() => endTrip('exit')}
          focusKey={state.sessionId}
          backLabel={copy.trip.back}
          isRTL={isRTL}
          theme={leaf.header}
          maxTitleFontScale={HEADING_MAX_FONT_SCALE}
        />
        <View style={styles.content}>
          <RouteEndpointRows
            theme={leaf.rows}
            from={{
              label: copy.trip.from,
              name: originName ?? copy.trip.chooseStart,
              icon: <icons.Place size={22} color={colors.brand} />,
              actionAccessibilityLabel: originName === null ? copy.trip.chooseStart : copy.trip.changeFrom(originName),
              onAction: () => openPicker('origin'),
            }}
            to={{
              label: copy.trip.to,
              name: destination,
              icon: <icons.Pin size={22} color={colors.brand} />,
              actionAccessibilityLabel: copy.trip.changeTo(destination),
              onAction: () => openPicker('destination'),
            }}
          />
          <View testID="navigation-status" accessibilityLiveRegion="polite" style={styles.status}>
            {loadState === 'loading' ? (
              <View style={styles.loading}>
                <icons.Loading size={22} color={colors.brand} />
                <Text style={[styles.subtitle, styles.flex, text]}>{copy.trip.loading}</Text>
              </View>
            ) : null}
            {status ? <Text style={[styles.subtitle, text]}>{status}</Text> : null}
          </View>
          {loadState === 'error' ? <Button label={copy.trip.retry} variant="brandTint" onPress={retry} /> : null}
          {state.canStartGuide ? (
            <StartOptionCard
              icon={<icons.Guide size={24} color={colors.brand} />}
              title={copy.trip.startGuide.title}
              subtitle={copy.trip.startGuide.subtitle}
              onPress={() => controller.startGuide()}
              theme={leaf.option}
            />
          ) : null}
          {allowLive && !candidate ? liveOption() : null}
          {allowLive && candidate ? upgradeCard('idle') : null}
          {allowLive ? entryGates(true) : null}
        </View>
      </>
    );
  };

  const upgradeLabels = useMemo<ManualLiveUpgradeCardLabels>(
    () => ({
      routing: '',
      destination: copy.trip.title,
      summary: (minutes, distance) => copy.live.remaining(formatDistance(distance, copy.routeStep) ?? '', minutes),
      ...copy.upgrade,
    }),
    [copy.upgrade, copy.trip.title, copy.live, copy.routeStep],
  );
  // One card for the whole Manual-to-Live step: confirm, acquire, show the candidate route, start, or report why not.
  const upgradeCard = (phase: 'idle' | 'acquiring' | 'confirming' | 'failed') => (
    <ManualLiveUpgradeCard
      upgrade={candidate ? { phase: 'preview', route: { estimatedTimeMin: candidate.etaMinutes, totalDistance: candidate.route.distanceM } } : { phase }}
      destination={destination}
      onConfirm={startLive}
      onCancel={() => { controller.cancelLive(); setConfirmSession(null); }}
      onStart={() => void controller.confirmLive()}
      labels={upgradeLabels}
      isRTL={isRTL}
      theme={leaf.upgrade}
    />
  );
  const guide = (): Stage => {
    if (!route) return { body: null, scroll: false };
    const upgradePhase = !confirming && !candidate ? 'idle' : requesting ? 'acquiring' : liveAttempt.status === 'blocked' ? 'failed' : 'confirming';
    const heading = <Text accessibilityRole="header" maxFontSizeMultiplier={HEADING_MAX_FONT_SCALE} style={[styles.plainTitle, text]}>{copy.trip.title(destination)}</Text>;
    const guideProps = {
      step: describeRouteStep(route.steps[state.stepIndex], copy.routeStep, destination),
      stepIndex: state.stepIndex,
      stepTotal: route.steps.length,
      onPrevious: () => controller.previousStep(),
      onNext: () => controller.nextStep(),
      onLive: allowLive && !confirming ? () => setConfirmSession(state.sessionId) : undefined,
      onEnd: () => endTrip('exit'),
      labels: copy.guide,
      isRTL,
      theme: leaf.guide,
    };
    const message = confirming && blockerMessage ? <Text testID="navigation-live-message" accessibilityLiveRegion="polite" style={[styles.subtitle, text]}>{blockerMessage}</Text> : null;
    if (large) {
      return {
        scroll: true,
        body: (
          <View style={styles.content}>
            {heading}
            <RouteGuideStep {...guideProps} />
            <RouteGuideLinks {...guideProps} />
            {upgradeCard(upgradePhase)}
            {entryGates(confirming || !!candidate)}
            {message}
          </View>
        ),
        footer: <View style={styles.content}><RouteGuideStepper {...guideProps} /></View>,
      };
    }
    return {
      scroll: true,
      body: (
        <View style={styles.content}>
          {heading}
          <RouteGuideCard {...guideProps} />
          {upgradeCard(upgradePhase)}
          {entryGates(confirming || !!candidate)}
          {message}
        </View>
      ),
    };
  };

  const liveGuidance = (): Stage => {
    if (!route || !live) return { body: null, scroll: false };
    const step = route.steps[state.stepIndex];
    // While live, a step's distance is what is left of it, not its whole length.
    const described = describeRouteStep(step, copy.routeStep, destination);
    const distance = step.kind === 'arrive' ? null : formatDistance(live.maneuverDistanceM, copy.routeStep);
    const notice = live.notice === 'rerouted' ? copy.live.rerouted : live.notice === 'kept_route' ? copy.live.keptRoute : null;
    const exit = <Button label={copy.live.exit} variant="outline" onPress={() => endTrip('exit')} />;
    const body = (
      <View style={styles.content}>
        <Text accessibilityRole="header" maxFontSizeMultiplier={HEADING_MAX_FONT_SCALE} style={[styles.plainTitle, text]}>{copy.trip.title(destination)}</Text>
        {live.rerouting ? (
          <RerouteProgressCard
            label={copy.live.rerouting}
            icon={<icons.Loading size={24} color={colors.onBrand} />}
            cardStyle={styles.turnCard}
            theme={leaf.rerouting}
          />
        ) : (
          <View
            testID="live-instruction"
            accessible
            accessibilityLiveRegion="polite"
            accessibilityLabel={distance ? `${described.instruction}. ${distance}` : described.instruction}
            style={styles.instructionCard}
          >
            <Text style={[styles.instruction, text]}>{described.instruction}</Text>
            {distance ? <Text style={[styles.distance, text]}>{distance}</Text> : null}
          </View>
        )}
        {live.signal !== 'good' ? (
          <GpsSignalBanner status={live.signal} message={live.signal === 'lost' ? copy.live.gpsLost : copy.live.gpsWeak} theme={leaf.gps} />
        ) : notice ? (
          <RerouteBanner message={notice} theme={leaf.notice} />
        ) : null}
        <Text style={[styles.subtitle, text]}>{copy.live.remaining(formatDistance(live.remainingM, copy.routeStep) ?? '', live.etaMinutes)}</Text>
        {entryGates(true)}
        {large ? null : exit}
      </View>
    );
    // Large text: End navigation stays under the scrolling instruction instead of below it.
    return large ? { body, footer: <View style={styles.content}>{exit}</View>, scroll: true } : { body, scroll: true };
  };

  const stage = (): Stage => {
    if (phase === 'browsing' || activePicker) return { body: directory(), scroll: false };
    if (phase === 'preview') return { body: preview(), scroll: true };
    if (phase === 'guide') return guide();
    if (phase === 'live') return liveGuidance();
    return { body: null, scroll: false }; // arrived: the arrival sheet below owns the screen
  };
  const { body, footer, scroll } = stage();
  const showRecenter = !!MapComponent && (phase === 'guide' || phase === 'live');

  return (
    <View testID="navigation-screen" style={[styles.root, style]}>
      {MapComponent ? (
        // The map is geography, not text: it and its controls keep their physical layout in every language.
        <View testID="navigation-map" style={styles.map}>
          <MapComponent
            ref={mapRef}
            phase={phase}
            route={route}
            originId={state.originId}
            destinationId={destinationId}
            position={live?.snapped ?? null}
            stepIndex={state.stepIndex}
            onAvailabilityChange={setMapAvailable}
            colorScheme={theme.colorScheme ?? 'light'}
          />
          {showRecenter ? (
            <Pressable testID="navigation-recenter" onPress={recenter} accessibilityRole="button" accessibilityLabel={copy.live.recenterA11y} style={styles.recenter}>
              <icons.Recenter size={20} color={colors.brand} />
              <Text style={styles.recenterText}>{copy.live.recenter}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {MapComponent && !mapAvailable ? <MapUnavailableBanner message={copy.mapUnavailable} theme={leaf.mapBanner} /> : null}
      <View testID="navigation-panel" style={[styles.panel, MapComponent ? (large ? styles.panelOverMapLarge : styles.panelOverMap) : styles.panelFull, { direction, paddingBottom: bottomInset }]}>
        {scroll ? <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>{body}</ScrollView> : body}
        {footer ? <View testID="navigation-pinned" style={styles.pinned}>{footer}</View> : null}
      </View>
      <ArrivalCard
        visible={phase === 'arrived'}
        destination={destination}
        labels={copy.arrival}
        bottomInset={arrivalBottomInset ?? bottomInset}
        onRecenter={recenter}
        onDone={() => endTrip('arrived')}
        theme={leaf.arrival}
      />
    </View>
  );
}

const makeStyles = ({ colors, radius }: NavigationScreenTheme) => StyleSheet.create({
  flex: { flex: 1 },
  root: { flex: 1, backgroundColor: colors.screen },
  map: { flex: 1, direction: 'ltr', overflow: 'hidden' },
  recenter: {
    position: 'absolute', right: 12, bottom: 12, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, borderRadius: radius, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, elevation: 4,
  },
  recenterText: { fontSize: 15, fontWeight: '700', color: colors.brand },
  panel: { backgroundColor: colors.surface, paddingTop: 12 },
  panelOverMap: { flexShrink: 1, maxHeight: '75%', borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  panelOverMapLarge: { flexShrink: 1, maxHeight: '80%', borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  panelFull: { flex: 1 },
  scroll: { paddingBottom: 16 },
  content: { gap: 12, paddingHorizontal: 16 },
  directory: { flexShrink: 1, gap: 8, paddingHorizontal: 16 },
  directoryLarge: { flexShrink: 1, paddingHorizontal: 16 },
  // The list already pads its content by 16; the header and message carry their own 16, so they step out first.
  headerBleed: { marginHorizontal: -16, gap: 8 },
  // GateChooser brings its own 12 margin; the content column already pads by 16.
  gateBleed: { marginHorizontal: -12 },
  bleedPad: { paddingHorizontal: 16 },
  pinned: { paddingTop: 8, paddingBottom: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.surface },
  plainHeader: { paddingHorizontal: 16, paddingBottom: 12, gap: 2 },
  plainTitle: { fontSize: 24, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: 15, lineHeight: 21, color: colors.textSecondary },
  status: { gap: 8 },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  // The reroute card's base: it supplies fill, alignment and gap itself.
  turnCard: { flexDirection: 'row', alignItems: 'center', borderRadius: radius, padding: 16, minHeight: 72 },
  instructionCard: {
    gap: 4, borderRadius: radius, padding: 16, minHeight: 72, backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.border,
  },
  instruction: { fontSize: 24, lineHeight: 30, fontWeight: '800', color: colors.text, flexShrink: 1 },
  distance: { fontSize: 18, color: colors.textSecondary },
});
