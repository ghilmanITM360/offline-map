import { readFileSync } from 'node:fs';

// #130 TTFD: the app is "fully usable" when the startup destination is LocationsDirectory (setup no
// longer blocking, persisted state already hydrated by Splash before it routes) and that screen has
// finished its transition in. Android's reportFullyDrawn() must be called once, only then.
const ANDROID_DIR = 'android/app/src/main/java/com/aicrafted/karachiijtema';

describe('startup readiness tracker (#130)', () => {
  const load = () => require('../services/StartupReadiness') as typeof import('../services/StartupReadiness');

  test('returning-user startup reports once the Directory transition ends', () => {
    const report = jest.fn();
    const tracker = load().createStartupReadiness(report);
    tracker.focus('Splash');
    tracker.transitionEnd('Splash');
    tracker.focus('LocationsDirectory');
    expect(report).not.toHaveBeenCalled(); // focused is not yet drawn
    tracker.transitionEnd('LocationsDirectory');
    expect(report).toHaveBeenCalledTimes(1);
  });

  test('never reports while Splash is the only screen', () => {
    const report = jest.fn();
    const tracker = load().createStartupReadiness(report);
    tracker.focus('Splash');
    tracker.transitionEnd('Splash');
    expect(report).not.toHaveBeenCalled();
  });

  test.each(['Welcome', 'Permission', 'DownloadMap'])('setup screen %s blocking startup never reports', (screen) => {
    const report = jest.fn();
    const tracker = load().createStartupReadiness(report);
    tracker.focus('Splash');
    tracker.focus(screen);
    tracker.transitionEnd(screen);
    expect(report).not.toHaveBeenCalled();
  });

  test('a first-install journey that reaches the Directory later is a different measurement and never reports', () => {
    const report = jest.fn();
    const tracker = load().createStartupReadiness(report);
    tracker.focus('Splash');
    tracker.focus('Welcome');
    tracker.focus('Permission');
    tracker.focus('DownloadMap');
    tracker.focus('LocationsDirectory');
    tracker.transitionEnd('LocationsDirectory');
    expect(report).not.toHaveBeenCalled();
  });

  test('a closing transition is not a drawn Directory', () => {
    const report = jest.fn();
    const tracker = load().createStartupReadiness(report);
    tracker.focus('LocationsDirectory');
    tracker.transitionEnd('LocationsDirectory', true);
    expect(report).not.toHaveBeenCalled();
  });

  test('repeated transitions, focus changes and re-renders report only once', () => {
    const report = jest.fn();
    const tracker = load().createStartupReadiness(report);
    tracker.focus('LocationsDirectory');
    tracker.transitionEnd('LocationsDirectory');
    tracker.transitionEnd('LocationsDirectory');
    tracker.focus('Main');
    tracker.transitionEnd('Main');
    tracker.focus('LocationsDirectory');
    tracker.transitionEnd('LocationsDirectory');
    expect(report).toHaveBeenCalledTimes(1);
  });

  test('without the native module the signal is a safe no-op', () => {
    const { markFullyUsable } = load();
    expect(() => markFullyUsable()).not.toThrow();
  });
});

describe('startup readiness wiring (#130)', () => {
  test('RootNavigator feeds screen focus and transitionEnd to the tracker', () => {
    const src = readFileSync('src/navigation/RootNavigator.tsx', 'utf8');
    expect(src).toContain('startupReadiness.focus(');
    expect(src).toContain('startupReadiness.transitionEnd(');
  });

  test('native module calls Activity.reportFullyDrawn on the UI thread', () => {
    const src = readFileSync(`${ANDROID_DIR}/StartupReadinessModule.kt`, 'utf8');
    expect(src).toContain('reportFullyDrawn()');
    expect(src).toContain('runOnUiThread');
    expect(src).toContain('fun markFullyUsable');
  });

  test('native report is once per Activity', () => {
    const src = readFileSync(`${ANDROID_DIR}/StartupReadinessModule.kt`, 'utf8');
    expect(src).toMatch(/reported\??\.get\(\)\s*===\s*activity/);
  });

  test('package is registered and MainActivity re-arms a recreated Activity from resume', () => {
    expect(readFileSync(`${ANDROID_DIR}/MainApplication.kt`, 'utf8')).toContain('StartupReadinessPackage()');
    const activity = readFileSync(`${ANDROID_DIR}/MainActivity.kt`, 'utf8');
    expect(activity).toContain('StartupReadiness.onActivityResumed(this)');
  });
});
