/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';
import type { LiveSignal } from '../domain/navigation/NavigationController';

/**
 * Spoken wording for the live announcements. `signalRecovered` is optional: without it a return to a good GPS signal is not announced
 * (the instruction that follows it is), so a host that has not translated the phrase never gets a half-translated sentence.
 */
export interface SafetyAnnouncementCopy {
  gpsLost: string;
  gpsWeak: string;
  signalRecovered?: string;
  rerouting: string;
  rerouted: string;
  keptRoute: string;
}

export interface SafetyAnnouncementInput {
  /** False outside Live: nothing is announced and the memory of what was said is cleared. */
  active: boolean;
  signal: LiveSignal;
  rerouting: boolean;
  notice: 'rerouted' | 'kept_route' | null;
  /** Identity of the current instruction (route and step): the text is spoken again only when this changes, not as the distance counts down. */
  instructionKey: string;
  /** What to say for the current instruction, including the distance left at that moment. */
  instruction: string;
  copy: SafetyAnnouncementCopy;
}

type Speak = (message: string, interrupt: boolean) => void;

/** iOS has no live regions: VoiceOver only speaks what is announced. Android keeps using `accessibilityLiveRegion` on the views. */
const speakOnIos: Speak = (message, interrupt) => {
  if (Platform.OS !== 'ios' || message.length === 0) return;
  // A safety interruption speaks now; everything else waits its turn instead of cutting the walker off.
  if (interrupt || typeof AccessibilityInfo.announceForAccessibilityWithOptions !== 'function') AccessibilityInfo.announceForAccessibility(message);
  else AccessibilityInfo.announceForAccessibilityWithOptions(message, { queue: true });
};

/**
 * The announcements a VoiceOver user needs while navigating: GPS lost (interrupts), weak or recovered, a reroute starting and its outcome, and
 * each new instruction. Each change is spoken once; repeated renders and a falling distance say nothing.
 */
export function useSafetyAnnouncements(input: SafetyAnnouncementInput, speak: Speak = speakOnIos): void {
  const { active, signal, rerouting, notice, instructionKey, instruction, copy } = input;
  const seen = useRef<{ signal: LiveSignal; rerouting: boolean; instructionKey: string } | null>(null);
  const latest = useRef({ instruction, notice, copy });
  latest.current = { instruction, notice, copy };

  useEffect(() => {
    if (!active) { seen.current = null; return; }
    const before = seen.current;
    seen.current = { signal, rerouting, instructionKey };
    const { copy: words, notice: outcome, instruction: spoken } = latest.current;

    if (before === null) { // Live just began: the first instruction is the only thing to say.
      if (!rerouting) speak(spoken, false);
      return;
    }
    if (signal !== before.signal) {
      if (signal === 'lost') speak(words.gpsLost, true);
      else if (signal === 'weak') speak(words.gpsWeak, false);
      else if (words.signalRecovered) speak(words.signalRecovered, false);
    }
    if (rerouting !== before.rerouting) {
      if (rerouting) speak(words.rerouting, false);
      else if (outcome) speak(outcome === 'rerouted' ? words.rerouted : words.keptRoute, false);
    }
    if (!rerouting && instructionKey !== before.instructionKey) speak(spoken, false);
  }, [active, signal, rerouting, instructionKey, speak]);
}
