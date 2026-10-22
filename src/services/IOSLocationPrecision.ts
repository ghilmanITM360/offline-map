// SPDX-License-Identifier: Apache-2.0
import { AppState, NativeEventEmitter, NativeModules, Platform } from 'react-native';

export interface IOSLocationSnapshot {
  authorization: 'whenInUse' | 'always' | 'denied' | 'restricted' | 'notDetermined' | 'unknown';
  precision: 'full' | 'reduced' | 'none';
  servicesEnabled: boolean;
}
interface PrecisionBridge {
  getSnapshot(): Promise<unknown>;
  addListener(event: string): void;
  removeListeners(count: number): void;
}
const SNAPSHOT_TIMEOUT_MS = 2000;
let revision = 0;
export function invalidateIOSPrecisionReads(): void { revision += 1; }

function bridge(): PrecisionBridge | undefined {
  return Platform.OS === 'ios' ? NativeModules?.IjtemaLocationPrecision : undefined;
}

/** Reads native authorization; never infers permission precision from fix accuracy or scope. */
export async function readIOSLocationSnapshot(): Promise<IOSLocationSnapshot | null> {
  const native = bridge();
  if (!native?.getSnapshot || AppState.currentState !== 'active') return null;
  const startedAtRevision = revision;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const value: unknown = await Promise.race([
      native.getSnapshot(),
      new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), SNAPSHOT_TIMEOUT_MS); }),
    ]);
    if (AppState.currentState !== 'active' || startedAtRevision !== revision || typeof value !== 'object' || value === null) return null;
    const snapshot = value as Record<string, unknown>;
    if (!['whenInUse', 'always', 'denied', 'restricted', 'notDetermined', 'unknown'].includes(String(snapshot.authorization)) ||
      !['full', 'reduced', 'none'].includes(String(snapshot.precision)) || typeof snapshot.servicesEnabled !== 'boolean') return null;
    return snapshot as unknown as IOSLocationSnapshot;
  } catch {
    return null; // An unavailable/failed native capability can never authorize Live.
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export function subscribeIOSLocationAuthorization(onChange: () => void): () => void {
  const native = bridge();
  if (!native) return () => {};
  try {
    const subscription = new NativeEventEmitter(native).addListener('locationPrecisionChanged', onChange);
    return () => subscription.remove();
  } catch {
    return () => {};
  }
}
