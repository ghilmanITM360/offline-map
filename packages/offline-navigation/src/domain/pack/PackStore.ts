/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { PackFileReader } from './PackVerifier';

/** Where a pack lives. `bundled` is read-only app content; `staging` is untrusted and never read by navigation. */
export interface PackRef {
  area: 'staging' | 'installed' | 'bundled';
  id: string;
}

/**
 * Host-owned persistence. The SDK never touches a filesystem: path joining, realpath checks, archive extraction,
 * downloads and platform durability (fsync) live behind this port. Contract the manager relies on:
 * - `writePointer` replaces the whole pointer atomically (readers see the old or the new text, never a mix).
 * - `commit` atomically renames a staging directory to a new installed id and fails if that id already exists.
 * - A directory that exists under `installed` is complete (it was renamed whole).
 */
export interface PackStore {
  readPointer(): Promise<string | null>;
  writePointer(text: string): Promise<void>;
  freeBytes(): Promise<number>;
  list(area: 'staging' | 'installed'): Promise<string[]>;
  readManifest(ref: PackRef): Promise<string | null>;
  reader(ref: PackRef): PackFileReader;
  commit(stagingId: string, installedId: string): Promise<void>;
  /** Idempotent: removing a missing directory is not an error. */
  remove(ref: PackRef & { area: 'staging' | 'installed' }): Promise<void>;
}
