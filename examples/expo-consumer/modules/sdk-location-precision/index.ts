import { requireOptionalNativeModule } from 'expo';

const native = requireOptionalNativeModule<{ getAccuracyAuthorization(): Promise<'full' | 'reduced' | 'none'> }>('SdkLocationPrecision');

/** iOS accuracy authorization, or 'none' where the native module is absent (Android, tests). Never prompts. */
export const readIOSPrecision = async (): Promise<'full' | 'reduced' | 'none'> => (native ? native.getAccuracyAuthorization() : 'none');
