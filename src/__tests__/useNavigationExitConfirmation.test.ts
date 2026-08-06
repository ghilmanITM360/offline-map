import { Alert, BackHandler } from 'react-native';
import { act, renderHook } from './test-utils';
import { useNavigationExitConfirmation } from '../viewmodels/useNavigationExitConfirmation';

function alertButtons(alertSpy: jest.SpyInstance) {
  return alertSpy.mock.calls.at(-1)?.[2] as Array<{ text: string; onPress?: () => void }>;
}

describe('useNavigationExitConfirmation', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('request, Cancel, and Confirm share one guarded exit path', async () => {
    const onExit = jest.fn();
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { result } = await renderHook(() => useNavigationExitConfirmation({ active: true, arrived: false, onExit }));

    await act(async () => {
      result.current.requestNavigationExit();
      result.current.requestNavigationExit();
    });
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(onExit).not.toHaveBeenCalled();

    await act(async () => alertButtons(alertSpy).find((button) => button.text === 'Cancel')?.onPress?.());
    expect(onExit).not.toHaveBeenCalled();

    await act(async () => result.current.requestNavigationExit());
    expect(alertSpy).toHaveBeenCalledTimes(2);
    const confirm = alertButtons(alertSpy).find((button) => button.text === 'Exit')?.onPress;
    await act(async () => {
      confirm?.();
      confirm?.();
    });
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  test('hardware Back confirms mid-navigation and completes Arrival immediately', async () => {
    const onExit = jest.fn();
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const backSpy = jest.spyOn(BackHandler, 'addEventListener');
    let arrived = false;
    const { rerender } = await renderHook(
      () => useNavigationExitConfirmation({ active: true, arrived, onExit }),
    );
    let back = backSpy.mock.calls.filter(([name]) => name === 'hardwareBackPress').at(-1)?.[1] as () => boolean;

    expect(back()).toBe(true);
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(onExit).not.toHaveBeenCalled();

    await act(async () => alertButtons(alertSpy).find((button) => button.text === 'Cancel')?.onPress?.());
    arrived = true;
    await rerender(undefined);
    back = backSpy.mock.calls.filter(([name]) => name === 'hardwareBackPress').at(-1)?.[1] as () => boolean;
    expect(back()).toBe(true);
    expect(back()).toBe(true);
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  test('confirmation callbacks become inert after unmount', async () => {
    const onExit = jest.fn();
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { result, unmount } = await renderHook(() => (
      useNavigationExitConfirmation({ active: true, arrived: false, onExit })
    ));

    await act(async () => result.current.requestNavigationExit());
    const confirm = alertButtons(alertSpy).find((button) => button.text === 'Exit')?.onPress;
    await unmount();
    confirm?.();

    expect(onExit).not.toHaveBeenCalled();
  });

  test('arrival Done path exits immediately once without opening confirmation', async () => {
    const onExit = jest.fn();
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { result } = await renderHook(() => useNavigationExitConfirmation({ active: true, arrived: true, onExit }));

    await act(async () => {
      result.current.completeArrivalNavigation();
      result.current.completeArrivalNavigation();
    });

    expect(alertSpy).not.toHaveBeenCalled();
    expect(onExit).toHaveBeenCalledTimes(1);
  });
});
