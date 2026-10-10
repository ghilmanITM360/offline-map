import { useSyncExternalStore } from 'react';
import type { RoutePreviewV2 } from '../services/RoutingServiceV2';

/** Runtime-only map presentation. Never used as published route or navigation authority. */
export interface ManualLivePreview {
  owner: symbol;
  committedRoute: unknown;
  destinationId: string;
  route: RoutePreviewV2;
}
let preview: ManualLivePreview | null = null;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
export function publishManualLivePreview(next: ManualLivePreview) {
  preview = next;
  listeners.forEach(listener => listener());
}
export function clearManualLivePreview(owner: symbol) {
  if (preview?.owner !== owner) return;
  preview = null;
  listeners.forEach(listener => listener());
}
export function useManualLivePreview() {
  return useSyncExternalStore(subscribe, () => preview, () => null);
}
