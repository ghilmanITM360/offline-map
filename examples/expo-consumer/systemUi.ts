import * as SystemUI from 'expo-system-ui';

/** The window behind the app (shown while a screen is laid out, under the system bars on Android). Failure is cosmetic. */
export const setSystemBackground = (color: string): void => {
  void SystemUI.setBackgroundColorAsync(color).catch(() => undefined);
};
