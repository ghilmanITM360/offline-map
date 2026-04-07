/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useAppStore } from '../store/useAppStore';
import { LIGHT_THEME, DARK_THEME, AppTheme } from '../services/ThemeService';

export function useTheme(): AppTheme {
  const darkMode = useAppStore((s) => s.settings.darkMode);
  return darkMode ? DARK_THEME : LIGHT_THEME;
}
