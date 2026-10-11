import { InstructionService } from '../services/InstructionService';
import { generateStreetInstructions } from '../services/StreetInstructionService';
import { localizeInstruction } from '../i18n/instructions';

test('generated legacy instructions change language without changing identity or geometry', () => {
  const steps = InstructionService.generateInstructions(['P1', 'P2']);
  const before = JSON.stringify(steps);
  expect(localizeInstruction(steps[0], 'ur-Latn')).toMatch(/Chalein|Shuru|Seedha/);
  expect(localizeInstruction(steps[0], 'ur')).toMatch(/[\u0600-\u06ff]/);
  expect(localizeInstruction(steps[0], 'en')).toBe(steps[0].text);
  expect(JSON.stringify(steps)).toBe(before);
});

test('street turns preserve exact semantic maneuver and arrival when localized', () => {
  const steps = generateStreetInstructions([{latitude:24,longitude:67},{latitude:24.001,longitude:67},{latitude:24.001,longitude:67.001}], [100,100], [undefined,undefined], {en:'Gate 12',ur:'گیٹ ۱۲'});
  expect(localizeInstruction(steps[1], 'ur-Latn')).toContain('Daayein');
  expect(localizeInstruction(steps[1], 'ur-Latn')).toContain('pohnchein');
});

test('unstructured provider instructions remain truthful verbatim fallback', () => {
  expect(localizeInstruction({text:'Use the footbridge after the shops.'}, 'ur-Latn')).toBe('Use the footbridge after the shops.');
});

test('changing locale keeps the manually selected guide step and route data intact', () => {
  const { useAppStore } = require('../store/useAppStore');
  const { useLocaleStore } = require('../i18n/localeStore');
  const steps = InstructionService.generateInstructions(['P1', 'P2']).map(step => ({text:step.text,semantic:step.semantic,distanceM:step.distance}));
  useAppStore.getState().startRouteGuide(steps);
  useAppStore.getState().setRouteGuideStep(1);
  const guide = useAppStore.getState().routeGuide;
  useLocaleStore.getState().setLocale('ur-Latn');
  expect(useAppStore.getState().routeGuide).toBe(guide);
  expect(guide.stepIndex).toBe(1);
  expect(localizeInstruction(guide.steps[1])).toContain('pohnch');
  useLocaleStore.getState().setLocale('en');
  useAppStore.getState().endRouteGuide();
});

test('duration labels follow the locale while numeric units and English contracts stay stable', () => {
  const { useLocaleStore } = require('../i18n/localeStore');
  useLocaleStore.getState().setLocale('ur-Latn');
  expect(InstructionService.formatDuration(65)).toBe('1 ghanta 5 minute');
  useLocaleStore.getState().setLocale('ur');
  expect(InstructionService.formatDuration(65)).toMatch(/گھنٹہ/);
  useLocaleStore.getState().setLocale('en');
  expect(InstructionService.formatDuration(65)).toBe('1 hr 5 min');
});

test('an English fallback name does not suppress known Urdu venue translation', () => {
  const step = { text: 'Start from Gate 12.', semantic: {
    key: 'instructions.start' as const, params: { name: 'Gate 12' }, urduNames: { name: 'Gate 12' },
  } };
  expect(localizeInstruction(step, 'ur')).toContain('گیٹ');
  expect(localizeInstruction(step, 'ur')).not.toContain('Gate');
});
