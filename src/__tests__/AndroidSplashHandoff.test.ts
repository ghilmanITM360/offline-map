import { readFileSync } from 'node:fs';

// #158 SPLASH-UX-003: MainActivity switches to AppTheme before super.onCreate. When the system splash
// exits, the window shows AppTheme's windowBackground until React Native paints its first frame; the
// Theme.AppCompat default is near-white, which showed as a 0.35 to 0.58 s white gap between the native
// green splash and the green JS splash (frame-accurate screen recording, API 36 emulator).
const styles = readFileSync('android/app/src/main/res/values/styles.xml', 'utf8');

function styleBlock(name: string): string {
  const match = styles.match(new RegExp(`<style name="${name}"[\\s\\S]*?</style>`));
  if (!match) throw new Error(`style ${name} not found`);
  return match[0];
}

describe('Android splash handoff (#158)', () => {
  test('AppTheme paints the splash green behind React Native until its first frame', () => {
    expect(styleBlock('AppTheme')).toContain('<item name="android:windowBackground">@color/splashscreen_background</item>');
  });

  test('the splash color is the brand green the JS splash also uses', () => {
    const colors = readFileSync('android/app/src/main/res/values/colors.xml', 'utf8');
    expect(colors).toContain('<color name="splashscreen_background">#2E7D32</color>');
  });
});
