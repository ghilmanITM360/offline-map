/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// B7R-3F: SDK UI files must render text through the SDK Text, never react-native's Text directly. This runs the
// repository's ESLint configuration on sample files and checks who gets flagged; it does not read the config's text.

import { Linter } from 'eslint';

// Linter, not the ESLint class: loading a config file there needs Node's experimental VM modules under Jest.
const linter = new Linter({ configType: 'flat', cwd: process.cwd() });
const config = require('../../eslint.config.js');
const RULE = '@typescript-eslint/no-restricted-imports';

async function flagged(filePath: string, code: string) {
  return linter.verify(code, config, { filename: filePath }).filter((m) => m.ruleId === RULE);
}

const NATIVE_TEXT = "import { Text } from 'react-native';\nexport const x = Text;\n";

describe('direct react-native Text imports in SDK UI files', () => {
  test.each([
    'src/views/screens/ExampleScreen.tsx',
    'src/views/components/map/Example.tsx',
    'src/components/Example.tsx',
    'packages/offline-navigation/src/ui/Example.tsx',
  ])('are rejected in %s', async (file) => {
    const messages = await flagged(file, NATIVE_TEXT);
    expect(messages).toHaveLength(1);
    expect(messages[0].message).toContain('@muslim-ummah/offline-navigation/ui');
  });

  test('are rejected when renamed on import', async () => {
    expect(await flagged('src/views/screens/ExampleScreen.tsx', "import { Text as NativeText } from 'react-native';\nexport const x = NativeText;\n")).toHaveLength(1);
  });

  test('are rejected when mixed into a larger import', async () => {
    expect(await flagged('src/views/screens/ExampleScreen.tsx', "import { View, Text, StyleSheet } from 'react-native';\nexport const x = [View, Text, StyleSheet];\n")).toHaveLength(1);
  });

  test.each([
    ['the wrapper itself', 'packages/offline-navigation/src/ui/Text.tsx', NATIVE_TEXT],
    ['tests', 'src/__tests__/Example.test.tsx', NATIVE_TEXT],
    ['code outside the SDK UI folders', 'src/poc/Example.tsx', NATIVE_TEXT],
    ['a type-only import', 'src/views/screens/ExampleScreen.tsx', "import type { Text } from 'react-native';\nexport type X = Text;\n"],
    ['TextInput', 'src/views/screens/ExampleScreen.tsx', "import { TextInput } from 'react-native';\nexport const x = TextInput;\n"],
    ['the SDK Text', 'src/views/screens/ExampleScreen.tsx', "import { Text } from '@muslim-ummah/offline-navigation/ui';\nexport const x = Text;\n"],
  ])('are not flagged for %s', async (_what, file, code) => {
    expect(await flagged(file, code)).toHaveLength(0);
  });
});
