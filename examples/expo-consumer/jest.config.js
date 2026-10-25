// The first render in a cold cache transforms React Native and the SDK, which takes several seconds.
module.exports = { preset: 'jest-expo/android', testMatch: ['<rootDir>/**/*.test.tsx'], testTimeout: 30_000 };
