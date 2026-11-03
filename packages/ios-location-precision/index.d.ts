/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
/** iOS accuracy authorization, or 'none' where the native module is absent (Android, tests). Never prompts. */
export declare const readIOSPrecision: () => Promise<'full' | 'reduced' | 'none'>;
