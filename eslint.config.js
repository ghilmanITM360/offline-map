const react = require('eslint-plugin-react');
const reactNative = require('eslint-plugin-react-native');
const typescriptEslint = require('@typescript-eslint/eslint-plugin');
const typescriptParser = require('@typescript-eslint/parser');

module.exports = [
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    plugins: {
      react,
      'react-native': reactNative,
      '@typescript-eslint': typescriptEslint,
    },
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    rules: {
      'react/react-in-jsx-scope': 'off',
      'react-native/no-inline-styles': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn'],
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
  },
  // B7R-3F: SDK UI renders text through the SDK Text. Scoped to our own UI folders (not tests, not hosts of the
  // SDK); the wrapper is the one place that may import the native Text.
  {
    files: ['src/views/**/*.{ts,tsx}', 'src/components/**/*.{ts,tsx}', 'packages/offline-navigation/src/ui/**/*.{ts,tsx}'],
    ignores: ['packages/offline-navigation/src/ui/Text.tsx'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'react-native',
              importNames: ['Text'],
              allowTypeImports: true,
              message:
                "Import Text from '@muslim-ummah/offline-navigation/ui' ('./Text' inside the package). react-native's Text keeps a stale measurement after an iOS font-size change (B7R-3F).",
            },
          ],
        },
      ],
    },
  },
];
