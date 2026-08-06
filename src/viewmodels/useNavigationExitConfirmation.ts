import { useCallback, useEffect, useRef } from 'react';
import { Alert, BackHandler } from 'react-native';

interface NavigationExitConfirmationInputs {
  active: boolean;
  arrived: boolean;
  onExit: () => void;
}

/** Shared owner for visible Exit and Android hardware Back. Arrival completion uses
 * the same once-only stop path, but deliberately skips confirmation. */
export function useNavigationExitConfirmation({ active, arrived, onExit }: NavigationExitConfirmationInputs) {
  const confirmationOpenRef = useRef(false);
  const exitStartedRef = useRef(false);
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;

  useEffect(() => {
    if (active) return;
    confirmationOpenRef.current = false;
    exitStartedRef.current = false;
  }, [active]);

  const exitOnce = useCallback(() => {
    if (!active || exitStartedRef.current) return;
    exitStartedRef.current = true;
    confirmationOpenRef.current = false;
    onExitRef.current();
  }, [active]);

  const requestNavigationExit = useCallback(() => {
    if (!active || exitStartedRef.current || confirmationOpenRef.current) return;
    confirmationOpenRef.current = true;
    const releaseConfirmation = () => {
      confirmationOpenRef.current = false;
    };
    Alert.alert(
      'Exit navigation?',
      'Do you want to stop navigation and return to map?',
      [
        { text: 'Cancel', style: 'cancel', onPress: releaseConfirmation },
        { text: 'Exit', style: 'destructive', onPress: exitOnce },
      ],
      { cancelable: true, onDismiss: releaseConfirmation },
    );
  }, [active, exitOnce]);

  const completeArrivalNavigation = exitOnce;

  useEffect(() => {
    if (!active) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      requestNavigationExit();
      return true;
    });
    return () => subscription.remove();
  }, [active, arrived, requestNavigationExit]);

  return { requestNavigationExit, completeArrivalNavigation };
}
