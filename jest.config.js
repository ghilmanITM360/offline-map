/**
 * Jest config for component tests (RNTL). Scoped ONLY to src/__tests__/ so it never
 * touches the standalone scripts/ test suite (see package.json "test" script / scripts/*.ts,
 * run via tsx — that suite is unaffected by this config).
 *
 * Run with: npm run test:components
 */
module.exports = {
  // 'jest-expo/android', not the platform-less base preset — the base preset's
  // haste.defaultPlatform is 'ios' (inherited from react-native/jest-preset.js), which
  // silently resolves platform-suffixed RN internals (e.g. BackHandler.ios.js, a no-op
  // stub) instead of the .android.js this app actually ships (Android-only, see CLAUDE.md).
  preset: 'jest-expo/android',
  roots: ['<rootDir>/src/__tests__'],
  testMatch: ['<rootDir>/src/__tests__/**/*.test.{ts,tsx}'],
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/jest.setup.ts'],
  moduleNameMapper: {
    '^@react-native-async-storage/async-storage$':
      '@react-native-async-storage/async-storage/jest/async-storage-mock',
  },
};
