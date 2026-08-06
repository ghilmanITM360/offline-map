import { computeMapContentInsets } from '../viewmodels/useOverlayInsets';

const common = {
  top: 144,
  right: 80,
  bottomSafeArea: 24,
  windowHeight: 800,
  snapPoints: ['15%', '50%', '92%'],
  sheetIndex: -1,
  navBarHeight: 0,
} as const;

describe('computeMapContentInsets', () => {
  test('Explore reserves only safe-area bottom', () => {
    expect(computeMapContentInsets({ ...common, mode: 'EXPLORE' })).toEqual({ top: 144, right: 80, bottom: 24, left: 0 });
  });

  test.each([
    [0, 120],
    [1, 400],
    [2, 736],
  ])('sheet snap index %s reserves its resolved visible height', (sheetIndex, bottom) => {
    expect(computeMapContentInsets({ ...common, mode: 'PLACE_SELECTED', sheetIndex }).bottom).toBe(bottom);
  });

  test('route preview uses shared sheet snap extent', () => {
    expect(computeMapContentInsets({ ...common, mode: 'ROUTE_PREVIEW', sheetIndex: 1 }).bottom).toBe(400);
  });

  test('active navigation uses measured trip-bar height', () => {
    expect(computeMapContentInsets({ ...common, mode: 'NAVIGATION', navBarHeight: 196 }).bottom).toBe(196);
  });

  test('arrival occludes label surface while modal owns interaction', () => {
    expect(computeMapContentInsets({ ...common, mode: 'ARRIVAL' }).bottom).toBe(800);
  });

  test('bottom safe area remains floor when sheet is closed', () => {
    expect(computeMapContentInsets({ ...common, mode: 'DETAILS', sheetIndex: -1, bottomSafeArea: 34 }).bottom).toBe(34);
  });
});
