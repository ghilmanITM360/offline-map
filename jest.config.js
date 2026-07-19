/**
 * Jest config for component tests (RNTL). Scoped ONLY to src/__tests__/ so it never
 * touches the standalone scripts/ test suite (see package.json "test" script / scripts/*.ts,
 * run via tsx — that suite is unaffected by this config).
 *
 * Run with: npm run test:components
 */
module.exports = {
  preset: 'jest-expo',
  roots: ['<rootDir>/src/__tests__'],
  testMatch: ['<rootDir>/src/__tests__/**/*.test.{ts,tsx}'],
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/jest.setup.ts'],
  moduleNameMapper: {
    '^@react-native-async-storage/async-storage$':
      '@react-native-async-storage/async-storage/jest/async-storage-mock',
  },
};
