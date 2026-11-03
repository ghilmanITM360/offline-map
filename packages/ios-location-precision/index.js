/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
// CommonJS on purpose: Jest and Metro both load it from node_modules without a transform.
const { requireOptionalNativeModule } = require('expo');

const native = requireOptionalNativeModule('SdkLocationPrecision');

/** iOS accuracy authorization, or 'none' where the native module is absent (Android, tests). Never prompts. */
exports.readIOSPrecision = async () => (native ? native.getAccuracyAuthorization() : 'none');
