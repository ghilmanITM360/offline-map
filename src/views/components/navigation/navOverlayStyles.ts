/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { StyleSheet } from 'react-native';

import { shadows, staticColors } from '../../../theme';

// Exit/mute/recenter are visually 44-48px — right at or below the 48dp Android minimum
// touch target with zero margin. hitSlop widens the tappable area without changing layout.
export const NAV_TOUCH_TARGET_HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 };

// Extracted verbatim from the old NavigationScreenV2 component
// (src/views/screens/NavigationScreen.tsx) — values must stay pixel-identical.
export const navOverlayStyles = StyleSheet.create({
  userMarker: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: staticColors.userLocation,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: staticColors.white,
  },
  userMarkerWrap: {
    width: 76,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userMarkerPulse: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: staticColors.userLocation,
  },
  rememberedLabel: {
    marginTop: 2,
    backgroundColor: 'rgba(26,115,232,0.92)',
    borderRadius: 7,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  rememberedLabelText: { color: staticColors.white, fontSize: 9, fontWeight: '700' },
  destinationMarker: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  startMarkerWrap: {
    alignItems: 'center',
  },
  startMarkerDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: staticColors.startMarker,
    borderWidth: 2,
    borderColor: staticColors.white,
  },
  startMarkerLabel: {
    marginTop: 3,
    backgroundColor: 'rgba(11,128,67,0.92)',
    borderRadius: 7,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  startMarkerLabelText: {
    color: staticColors.white,
    fontSize: 9,
    fontWeight: '700',
  },
  recenterButton: {
    position: 'absolute',
    right: 16,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: staticColors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.medium,
    // Explicit zIndex above HomeScreen's navControls (zIndex:5) so this overlay's own
    // recenter button always wins hit-testing if their absolute-positioned regions ever collide.
    zIndex: 6,
  },
  mapUnavailableBanner: {
    marginHorizontal: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: staticColors.bannerTranslucentWhite,
    borderWidth: 1,
    borderColor: staticColors.border,
  },
  mapUnavailableText: {
    color: staticColors.iconMuted,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  v2EntryGateBanner: {
    marginHorizontal: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: staticColors.entryGateBackground,
    borderWidth: 1,
    borderColor: staticColors.entryGateBorder,
  },
  v2EntryGateText: {
    color: staticColors.focusedBlock,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  directGateOptions: {
    marginHorizontal: 12,
    padding: 12,
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: staticColors.warning,
    backgroundColor: staticColors.warningBackground,
    zIndex: 12,
  },
  directGateOptionsTitle: {
    color: staticColors.warningText,
    fontSize: 16,
    fontWeight: '700',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  topStatusStack: {
    paddingTop: 8,
    gap: 8,
  },
  // The map control column is a 56 dp circle at right: 12.
  topStatusStackClearOfControls: { marginEnd: 72 },
  outsideStatusCardWrap: {
    marginHorizontal: 12,
  },
  weakGpsBanner: {
    marginHorizontal: 12,
    marginTop: 8,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: staticColors.weakGpsBackground,
  },
  // Safety-relevant: weak-GPS / GPS-lost warning. Bumped from 12 -> 16 (elderly-user
  // legibility pass) to match the file's existing "important secondary text" tier
  // (instructionDistance/exitText, also 16). No fixed height on weakGpsBanner, so the
  // banner grows with the text instead of clipping it.
  weakGpsText: {
    color: staticColors.white,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  rerouteHintBanner: {
    marginHorizontal: 12,
    marginTop: 4,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: staticColors.warningBackground,
    borderWidth: 1,
    borderColor: staticColors.warning,
  },
  // Safety-relevant: reroute notification. Bumped from 12 -> 16, matching weakGpsText
  // (the two banners stack directly above one another, so keeping them the same size
  // reads as a deliberate pair rather than an arbitrary mismatch).
  rerouteHintText: {
    color: staticColors.warningText, // #8D6E63 on #FFF8E1 fails AA (4.35:1); #7C4A03 passes (6.97:1)
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  instructionCard: {
    // Deep blue (not arrivalGreen — that's reserved for the arrived state so the
    // two don't read as the same "done" signal while still actively navigating).
    backgroundColor: staticColors.infoStrong,
    paddingHorizontal: 16,
    paddingVertical: 18,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 10,
    shadowColor: staticColors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  rerouteCard: {
    backgroundColor: staticColors.rerouteBackground,
    justifyContent: 'center',
    gap: 12,
  },
  // Already 18px (above the 15-17px safety-text floor) — no size change needed. The white
  // text on rerouteBackground failed WCAG AA (2.70:1) though; fixed by darkening
  // rerouteBackground itself in theme/colors.ts rather than changing this style.
  rerouteText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: staticColors.white,
  },
  instructionIcon: {
    marginRight: 16,
    width: 40,
    alignItems: 'center',
  },
  instructionTextContainer: {
    flex: 1,
    minWidth: 0,
  },
  // Maneuver label is the primary instruction (e.g. "Left Turn") — must read as the
  // dominant element in the card, ahead of the distance/road-name detail lines below it.
  maneuverLabel: {
    fontSize: 24,
    fontWeight: '800',
    color: staticColors.white,
  },
  instructionDistance: {
    fontSize: 16,
    fontWeight: '700',
    color: staticColors.infoBorder,
    marginTop: 4,
  },
  roadNameText: {
    fontSize: 15,
    fontWeight: '600',
    color: staticColors.infoBorder,
    marginTop: 1,
  },
  // Safety-relevant: upcoming-turn preview ("Then: ..."). Bumped from 13 -> 15 to match
  // roadNameText/distanceRemaining, the file's existing "detail" tier one step below the
  // bold alert-banner tier above. instructionTextContainer has no fixed height, so the
  // instruction card grows to fit rather than clipping.
  nextStepText: {
    fontSize: 15,
    color: staticColors.infoBorder,
    marginTop: 6,
  },
  muteButton: {
    padding: 10,
    marginLeft: 8,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: staticColors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 32,
    ...shadows.high,
    zIndex: 6,
  },
  tripInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  tripTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  timeRemaining: {
    fontSize: 26,
    fontWeight: 'bold',
    color: staticColors.arrivalGreen,
  },
  distanceRemaining: {
    fontSize: 15,
    color: staticColors.iconMuted,
    marginTop: 2,
  },
  destName: {
    // destNameMuted (#888) is ~3.6:1 on white, fails AA for 14px text; iconMuted
    // (#5F6368, already used one line up for distanceRemaining) passes and keeps
    // this row visually consistent.
    fontSize: 14,
    color: staticColors.iconMuted,
    marginTop: 4,
  },
  exitButton: {
    // Neutral, not exitDanger red — exiting navigation is a routine action, not a
    // destructive one; red is reserved for actual alerts (weak GPS, reroute).
    backgroundColor: staticColors.neutralSurface,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 28,
    gap: 8,
  },
  directionsButton: {
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
    backgroundColor: staticColors.neutralSurface,
    borderRadius: 12,
    padding: 12,
  },
  exitText: {
    color: staticColors.textPrimary,
    fontSize: 16,
    fontWeight: 'bold',
  },
});
