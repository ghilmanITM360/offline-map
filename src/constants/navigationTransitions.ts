/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Named timings for the ROUTE_PREVIEW -> ACTIVE_NAVIGATION transition (Stage 5).
// The route-preview sheet starts collapsing and CameraManager starts its navigation-
// entry camera move at the same instant "Start" is pressed; the nav chrome (top
// maneuver card / bottom trip bar) is deliberately held back a beat so it doesn't pop
// in on the exact same frame as the sheet closing, giving a staggered, Google-Maps-like
// reveal instead of everything snapping in at once. CameraManager remains the sole
// owner of the camera move itself — this only names its existing default duration.
export const NAV_TRANSITION_TIMINGS = {
  /** Default duration of CameraManager.enterNavigationCamera()'s camera move. */
  cameraEnterMs: 800,
  /** Delay before the nav chrome (top/bottom bars) starts fading/sliding in. */
  chromeRevealDelayMs: 150,
  /** Duration of the nav chrome's own fade/slide-in animation. */
  chromeFadeMs: 220,
  /** Fade duration when LocationSheet swaps its route-preview content (start
   * summary <-> start options, loading/error/ready status) instead of snapping. */
  sheetContentFadeMs: 180,
} as const;
