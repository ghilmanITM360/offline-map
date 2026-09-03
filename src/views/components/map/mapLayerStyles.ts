/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { StyleSheet } from 'react-native';

import { markerColors, markerSizes, staticColors } from '../../../theme';

// Styles shared by the Home and Navigation map-layer renderers. Extracted
// verbatim from src/views/screens/HomeScreen.tsx and NavigationScreen.tsx —
// values must stay pixel-identical to the pre-extraction inline JSX.
export const mapLayerStyles = StyleSheet.create({
  rastaLabel: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  rastaLabelText: { color: staticColors.white, fontSize: 10, fontWeight: '600' },
  rastaLabelFocused: {
    backgroundColor: staticColors.textPrimary,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    elevation: 4,
  },
  rastaLabelTextFocused: {
    fontSize: 12,
    fontWeight: '800',
  },
  v2RouteLabel: {
    // staticColors.specialRouteAccent at ~0.82 alpha (matches the original rgba(142,36,170,0.82)).
    backgroundColor: `${staticColors.specialRouteAccent}D1`,
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  v2RouteLabelText: { color: staticColors.white, fontSize: 10, fontWeight: '700' },
  v2RouteLabelFocused: {
    backgroundColor: staticColors.specialRouteAccentFocused,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    elevation: 4,
  },
  v2RouteLabelTextFocused: {
    fontSize: 12,
    fontWeight: '800',
  },
  v2SelectedLabel: {
    borderWidth: 1,
    borderColor: staticColors.white,
  },
  v2BlockLabel: {
    minWidth: 58,
    minHeight: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderWidth: 1,
    borderColor: staticColors.normalBlock,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  v2BlockLabelFocused: {
    backgroundColor: staticColors.focusedBlock,
    borderColor: staticColors.focusedBlock,
    minWidth: 66,
    minHeight: 32,
    elevation: 4,
  },
  v2SelectedBlockLabel: {
    backgroundColor: staticColors.selectedBlock,
    borderColor: staticColors.white,
  },
  v2BlockLabelText: {
    color: staticColors.normalBlock,
    fontSize: 11,
    fontWeight: '800',
  },
  v2BlockLabelTextFocused: {
    color: staticColors.white,
    fontSize: 13,
    fontWeight: '900',
  },
  v2SelectedBlockLabelText: {
    color: staticColors.white,
  },
  v2GateMarker: {
    // minWidth/minHeight: harmless, reasonable sizing floor — kept even though it
    // did not fix the Android full-label clipping bug (see GateLayer.tsx comment).
    // Confirmed via onLayout logging that RN's own layout engine measures this box
    // correctly (108x49.7dp); react-native-maps' Android marker snapshot still
    // renders a much smaller, hard-clipped bitmap regardless — a native rendering
    // bug outside JS/style control, not something this stylesheet can fix.
    minWidth: 108,
    minHeight: 34,
    backgroundColor: staticColors.gateMarkerDot,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1.5,
    borderColor: staticColors.white,
    elevation: 4,
    shadowColor: staticColors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 3,
  },
  v2GateMarkerWarning: {
    backgroundColor: markerColors.warning,
  },
  v2GateMarkerDot: {
    width: markerSizes.gate,
    height: markerSizes.gate,
    borderRadius: markerSizes.gate / 2,
    backgroundColor: staticColors.gateMarkerDot,
    borderWidth: 1.5,
    borderColor: staticColors.white,
    elevation: 3,
    shadowColor: staticColors.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
  },
  // react-native-maps' Marker has no hitSlop — the only way to widen a custom-view
  // marker's touch region is to widen the child View itself (anchor stays centered,
  // so the visible dot doesn't move). Only used for suppressed/unselected gates (see
  // GateLayer.tsx) — the non-suppressed case already gets a bigger Pressable via its
  // MapLabelOverlay label item. 44x44 matches the platform-standard minimum touch
  // target (Android/iOS accessibility guidance, Google Maps parity).
  v2GateMarkerHitArea: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  v2GateMarkerText: {
    color: staticColors.white,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  v2GateMarkerFocused: {
    backgroundColor: '#0D47A1',
    minWidth: 116,
    minHeight: 40,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: staticColors.white,
    elevation: 8,
  },
  v2GateMarkerSelected: {
    backgroundColor: '#1A237E',
    borderWidth: 2.5,
    borderColor: '#FFD700',
  },
  v2GateMarkerTextFocused: {
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  v2GateMarkerCompact: {
    backgroundColor: staticColors.gateMarkerDot,
    borderRadius: 14,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: staticColors.white,
    elevation: 4,
    shadowColor: staticColors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
  },
  v2GateMarkerCompactFocused: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    elevation: 8,
  },
  v2GateMarkerTextCompact: {
    color: staticColors.white,
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
  },
  v2GateMarkerTextNumber: {
    fontSize: 12,
    fontWeight: '900',
  },
  previewGateLabel: {
    backgroundColor: 'rgba(26,115,232,0.92)',
    borderRadius: 7,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  previewGateLabelWarning: {
    backgroundColor: 'rgba(245,124,0,0.95)',
  },
  previewLabelText: {
    color: staticColors.white,
    fontSize: 10,
    fontWeight: '800',
  },
  v2BlockLabelUrdu: {
    color: staticColors.normalBlock,
    fontSize: 9,
    fontWeight: '600',
    marginTop: 1,
  },
  v2BlockLabelUrduFocused: {
    color: staticColors.lightGreenSubtext,
  },
  v2GateMarkerUrdu: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 9,
    fontWeight: '600',
    marginTop: 1,
  },
  rastaLabelUrdu: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 8,
    fontWeight: '500',
    marginTop: 1,
  },
  rastaEndpointDot: {
    width: markerSizes.rasta,
    height: markerSizes.rasta,
    borderRadius: markerSizes.rasta / 2,
    backgroundColor: staticColors.white,
    borderWidth: 2,
  },
  rastaEndpointDotEmphasized: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: staticColors.white,
    borderWidth: 2.5,
    elevation: 3,
  },
  v2RouteLabelUrdu: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 8,
    fontWeight: '500',
    marginTop: 1,
  },
  // Same invisible-hit-area pattern as v2GateMarkerHitArea — facilityMarker's visible
  // icon (markerSizes.facility, well under 44dp) stays the same size; this wrapper
  // just widens the Marker's own touch region, anchor-centered so nothing shifts.
  facilityMarkerHitArea: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  facilityMarker: {
    width: markerSizes.facility,
    height: markerSizes.facility,
    borderRadius: markerSizes.facility / 2,
    backgroundColor: staticColors.facilityAccent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: staticColors.white,
    elevation: 3,
    shadowColor: staticColors.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
  },
  facilityMarkerSelected: {
    borderWidth: 2.5,
    borderColor: '#FFD700',
    elevation: 6,
  },
});
