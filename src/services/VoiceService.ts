/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as Speech from 'expo-speech';

export class VoiceService {
  static speak(text: string): void {
    Speech.stop();
    Speech.speak(text, { language: 'en-US', rate: 0.9 });
  }

  static stop(): void {
    Speech.stop();
  }

  static async isSpeaking(): Promise<boolean> {
    return Speech.isSpeakingAsync();
  }
}
