import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

// Stage 5 TASK 2: press Start -> sheet collapses / CameraManager moves / nav chrome
// reveals should feel staggered, not a single simultaneous snap. This checks the named
// timing constants exist and are actually wired into the camera manager and both nav
// chrome components, without pinning to exact millisecond values (those are free to tune).
import { NAV_TRANSITION_TIMINGS } from '../src/constants/navigationTransitions';

assert(NAV_TRANSITION_TIMINGS.cameraEnterMs > 0, 'cameraEnterMs must be a positive duration');
assert(NAV_TRANSITION_TIMINGS.chromeFadeMs > 0, 'chromeFadeMs must be a positive duration');
assert(
  NAV_TRANSITION_TIMINGS.chromeRevealDelayMs > 0,
  'chromeRevealDelayMs must be > 0 so the chrome does not pop in on the same frame as the sheet/camera',
);

const cameraManagerSource = readFileSync('src/viewmodels/useCameraManager.ts', 'utf8');
assert(
  cameraManagerSource.includes("import { NAV_TRANSITION_TIMINGS } from '../constants/navigationTransitions';"),
  'CameraManager must import the shared transition timing constants',
);
assert(
  cameraManagerSource.includes('opts?.duration ?? NAV_TRANSITION_TIMINGS.cameraEnterMs'),
  'enterNavigationCamera must default its duration from the shared constant, not a hardcoded number',
);

for (const chromeFile of [
  'src/views/components/navigation/NavigationChromeV1.tsx',
  'src/views/components/navigation/NavigationChromeV2.tsx',
]) {
  const source = readFileSync(chromeFile, 'utf8');
  assert(
    source.includes("import { NAV_TRANSITION_TIMINGS } from '../../../constants/navigationTransitions';"),
    `${chromeFile} must import the shared transition timing constants`,
  );
  assert(
    source.includes('NAV_TRANSITION_TIMINGS.chromeRevealDelayMs') && source.includes('NAV_TRANSITION_TIMINGS.chromeFadeMs'),
    `${chromeFile} must stagger its mount animation using the shared reveal delay + fade duration`,
  );
  assert(
    source.includes('return () => clearTimeout(revealTimer);'),
    `${chromeFile} must clear its reveal timer on unmount to avoid a late animation start after exit`,
  );
}

console.log('Nav start transition timing checks passed.');
