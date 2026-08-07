import { act, renderHook } from './test-utils';
import { useHomeViewModel } from '../viewmodels/HomeViewModel';

describe('HomeViewModel search reset', () => {
  test('clearing a dismissed search session clears its category and transient results', async () => {
    const hook = await renderHook(() => useHomeViewModel());

    await act(() => hook.result.current.handleCategoryPress('gates'));
    expect(hook.result.current.activeCategory).toBe('gates');
    expect(hook.result.current.searchResults.length).toBeGreaterThan(0);

    await act(() => hook.result.current.clearSearch());

    expect(hook.result.current.activeCategory).toBeNull();
    expect(hook.result.current.searchQuery).toBe('');
    expect(hook.result.current.searchResults).toEqual([]);
  });
});
