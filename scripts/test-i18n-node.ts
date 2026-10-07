import { strict as assert } from 'node:assert';
import { getLocale, t, translate } from '../src/i18n';

// The routing/data script suites import services that call t(); the i18n layer must load without React Native.
assert.equal(getLocale(), 'en');
assert.equal(t('settings.language'), 'Language');
assert.equal(translate('ur', 'settings.language'), 'زبان');
assert.equal(translate('ur-Latn', 'settings.language'), 'Zabaan');
console.log('i18n loads under plain Node; English default.');
