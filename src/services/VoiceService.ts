/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as Speech from 'expo-speech';

export class VoiceService {
  static speak(text: string, language: 'en' | 'ur' = 'en'): void {
    Speech.stop();
    const locale = language === 'ur' ? 'ur-PK' : 'en-US';
    Speech.speak(text, { language: locale, rate: 0.85 });
  }

  static stop(): void {
    Speech.stop();
  }

  static async isSpeaking(): Promise<boolean> {
    return Speech.isSpeakingAsync();
  }
}
