/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import * as Speech from 'expo-speech';
const queue = []; // fixed: buffer instructions so close-together prompts are spoken sequentially
let speaking = false; // fixed: track whether a prompt is currently being spoken
let activeSpeechText = null; // fixed: remember the current prompt to skip exact duplicates
function drainQueue() {
    if (speaking || queue.length === 0)
        return; // fixed: only start speech when the queue has work and nothing is already speaking
    const next = queue.shift();
    if (!next)
        return; // fixed: satisfy the type checker when the queue changes mid-drain
    speaking = true; // fixed: mark the speech channel busy before starting Expo Speech
    activeSpeechText = next.text; // fixed: keep track of the active prompt for duplicate suppression
    Speech.speak(next.text, {
        language: next.locale,
        rate: 0.85,
        onDone: () => {
            speaking = false; // fixed: release the speech lock after a prompt finishes
            activeSpeechText = null; // fixed: clear the active prompt when speech completes
            drainQueue(); // fixed: automatically continue with queued prompts
        },
        onStopped: () => {
            speaking = false; // fixed: release the speech lock after speech is stopped
            activeSpeechText = null; // fixed: clear the active prompt when speech is interrupted
            drainQueue(); // fixed: continue draining after interruptions
        },
        onError: () => {
            speaking = false; // fixed: release the speech lock after synthesis errors
            activeSpeechText = null; // fixed: clear the active prompt when synthesis fails
            drainQueue(); // fixed: continue draining even if one prompt errors
        },
    });
}
export class VoiceService {
    static speak(text, language = 'en') {
        const locale = language === 'ur' ? 'ur-PK' : 'en-US'; // fixed: keep locale selection while moving to queued speech
        if (activeSpeechText === text)
            return; // fixed: skip duplicate prompts that are already being spoken
        if (queue.length > 0 && queue[queue.length - 1].text === text)
            return; // fixed: skip duplicate prompts already waiting in the queue
        queue.push({ text, locale }); // fixed: enqueue prompts instead of cutting off the current instruction
        drainQueue(); // fixed: start draining immediately when the queue receives new work
    }
    static stop() {
        queue.length = 0; // fixed: clear any buffered prompts before stopping speech
        speaking = false; // fixed: reset queue state when speech is force-stopped
        activeSpeechText = null; // fixed: clear the active prompt when speech is force-stopped
        Speech.stop(); // fixed: preserve the explicit stop behavior for mute/exit flows
    }
    static async isSpeaking() {
        return Speech.isSpeakingAsync();
    }
}
