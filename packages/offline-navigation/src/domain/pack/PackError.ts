/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type PackErrorCode =
  | 'manifest-malformed' | 'schema-unsupported' | 'field-invalid' | 'totals-mismatch'
  | 'resource-path-unsafe' | 'resource-duplicate' | 'required-resource-missing'
  | 'sdk-incompatible' | 'capability-missing' | 'venue-mismatch'
  | 'resource-missing' | 'resource-unexpected' | 'resource-size-mismatch' | 'resource-hash-mismatch' | 'resource-unreadable'
  | 'digest-unverifiable' | 'manifest-digest-mismatch'
  | 'signature-required' | 'signature-untrusted-key' | 'signature-invalid'
  | 'storage-insufficient' | 'staging-missing' | 'version-not-newer' | 'already-installed' | 'version-conflict'
  | 'commit-failed' | 'pointer-write-failed' | 'pointer-corrupt' | 'not-installed' | 'no-previous';

export interface PackError {
  code: PackErrorCode;
  message: string;
  /** Offending field or resource path, when one is known. */
  path?: string;
}
