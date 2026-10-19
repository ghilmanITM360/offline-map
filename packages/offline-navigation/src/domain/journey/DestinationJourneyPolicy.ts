/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Pure destination-tap policy lifted out of useAppStore (B2b, AUD-01): one explicit tap may authorize one guarded
// live attempt, and Directory answers are only valid for the request that asked. The host store applies these
// decisions with its own `set(...)`; nothing here reads state, time or UI.

import type { NavigationMode } from './LocationCapability';

export interface DestinationJourneyIntent {
  id: number;
  destinationId: string;
  autoLive: 'eligible' | 'ineligible' | 'consumed';
}

/** What the Directory is being opened to choose; null = plain browsing. */
export type DirectoryPurpose = 'start' | 'destination';
export interface DirectoryRequest { serial: number; journeyId: number; destinationId: string; purpose: DirectoryPurpose }
export interface DirectoryAnswer { purpose: DirectoryPurpose; request: DirectoryRequest }

/** A tap is auto-live eligible only when nothing is navigating, services are on and the capability is live. */
export function decideAutoLive(input: {
  isNavigating: boolean;
  servicesState: 'enabled' | 'disabled' | 'unknown';
  capabilityMode: NavigationMode;
}): DestinationJourneyIntent['autoLive'] {
  return !input.isNavigating && input.servicesState === 'enabled' && input.capabilityMode === 'live_navigation'
    ? 'eligible' : 'ineligible';
}

/** The spent intent when `id` is the current, still-eligible intent (the one-shot grant); null = refuse. */
export function consumeIntent(intent: DestinationJourneyIntent | null, id: number): DestinationJourneyIntent | null {
  if (!intent || intent.id !== id || intent.autoLive !== 'eligible') return null;
  return { ...intent, autoLive: 'consumed' };
}

/** The spent intent when `id` is current and unspent; null = nothing to change. */
export function retireIntent(intent: DestinationJourneyIntent | null, id: number): DestinationJourneyIntent | null {
  if (intent?.id !== id || intent.autoLive === 'consumed') return null;
  return { ...intent, autoLive: 'consumed' };
}

/** Is `answer` the response to the live request for the current journey and destination? */
export function isAnswerCurrent(input: {
  answer: DirectoryAnswer;
  request: DirectoryRequest | null;
  purpose: DirectoryPurpose | null;
  journeyId: number;
  destinationId: string | undefined;
}): boolean {
  const { answer, request } = input;
  return !!request && !!input.purpose && !!answer.request &&
    answer.request.serial === request.serial && answer.request.journeyId === request.journeyId &&
    answer.request.destinationId === request.destinationId && answer.request.purpose === request.purpose &&
    answer.purpose === request.purpose && request.journeyId === input.journeyId &&
    request.destinationId === input.destinationId;
}

/** May the queued answer still be consumed for `destinationId`? */
export function isQueuedAnswerConsumable(input: {
  queued: DirectoryAnswer | null;
  answer: DirectoryAnswer;
  request: DirectoryRequest | null;
  journeyId: number;
  destinationId: string;
  plannerDestinationId: string | undefined;
}): boolean {
  const { queued, answer, request } = input;
  return queued === answer && request?.serial === answer.request.serial &&
    answer.request.journeyId === input.journeyId && answer.request.destinationId === input.destinationId &&
    input.plannerDestinationId === input.destinationId;
}
