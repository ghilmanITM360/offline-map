/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { StyleSheet } from 'react-native';

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
  rastaLabelText: { color: '#FFFFFF', fontSize: 10, fontWeight: '600' },
  rastaLabelFocused: {
    backgroundColor: '#202124',
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
    backgroundColor: 'rgba(142,36,170,0.82)',
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  v2RouteLabelText: { color: '#FFFFFF', fontSize: 10, fontWeight: '700' },
  v2RouteLabelFocused: {
    backgroundColor: '#6A0DAD',
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
    borderColor: '#FFFFFF',
  },
  v2BlockLabel: {
    minWidth: 58,
    minHeight: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderWidth: 1,
    borderColor: '#2E7D32',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  v2BlockLabelFocused: {
    backgroundColor: '#1B5E20',
    borderColor: '#1B5E20',
    minWidth: 66,
    minHeight: 32,
    elevation: 4,
  },
  v2SelectedBlockLabel: {
    backgroundColor: '#1A73E8',
    borderColor: '#FFFFFF',
  },
  v2BlockLabelText: {
    color: '#2E7D32',
    fontSize: 11,
    fontWeight: '800',
  },
  v2BlockLabelTextFocused: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },
  v2SelectedBlockLabelText: {
    color: '#FFFFFF',
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
    backgroundColor: '#1565C0',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 3,
  },
  v2GateMarkerWarning: {
    backgroundColor: '#E65100',
  },
  v2GateMarkerDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#1565C0',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
  },
  v2GateMarkerText: {
    color: '#FFFFFF',
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
    borderColor: '#FFFFFF',
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
    backgroundColor: '#1565C0',
    borderRadius: 14,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    elevation: 4,
    shadowColor: '#000',
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
    color: '#FFFFFF',
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
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
  v2BlockLabelUrdu: {
    color: '#2E7D32',
    fontSize: 9,
    fontWeight: '600',
    marginTop: 1,
  },
  v2BlockLabelUrduFocused: {
    color: '#E8F5E9',
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
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
  },
  rastaEndpointDotEmphasized: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 2.5,
    elevation: 3,
  },
  v2RouteLabelUrdu: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 8,
    fontWeight: '500',
    marginTop: 1,
  },
});
