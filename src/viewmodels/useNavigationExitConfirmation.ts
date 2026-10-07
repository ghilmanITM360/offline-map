import { useCallback, useEffect, useRef } from 'react';
import { Alert, BackHandler } from 'react-native';
import { t } from '../i18n';

interface NavigationExitConfirmationInputs {
  active: boolean;
  arrived: boolean;
  onExit: () => void;
}

/** Shared owner for visible Exit and Android hardware Back. Arrival completion uses
 * the same once-only stop path, but deliberately skips confirmation. */
export function useNavigationExitConfirmation({ active, arrived, onExit }: NavigationExitConfirmationInputs) {
  const mountedRef = useRef(true);
  const activeRef = useRef(active);
  activeRef.current = active;
  const confirmationOpenRef = useRef(false);
  const exitStartedRef = useRef(false);
  const confirmationSessionRef = useRef(0);
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;

  useEffect(() => () => {
    mountedRef.current = false;
    confirmationOpenRef.current = false;
    exitStartedRef.current = true;
    confirmationSessionRef.current += 1;
  }, []);

  useEffect(() => {
    if (active) return;
    confirmationOpenRef.current = false;
    exitStartedRef.current = false;
    confirmationSessionRef.current += 1;
  }, [active]);

  useEffect(() => {
    if (!arrived) return;
    confirmationOpenRef.current = false;
    confirmationSessionRef.current += 1;
  }, [arrived]);

  const exitOnce = useCallback(() => {
    if (!mountedRef.current || !activeRef.current || exitStartedRef.current) return;
    exitStartedRef.current = true;
    confirmationOpenRef.current = false;
    onExitRef.current();
  }, []);

  const requestNavigationExit = useCallback(() => {
    if (!mountedRef.current || !activeRef.current || exitStartedRef.current || confirmationOpenRef.current) return;
    confirmationOpenRef.current = true;
    const confirmationSession = confirmationSessionRef.current;
    const releaseConfirmation = () => {
      if (confirmationSession !== confirmationSessionRef.current) return;
      confirmationOpenRef.current = false;
    };
    const confirmExit = () => {
      if (confirmationSession !== confirmationSessionRef.current) return;
      exitOnce();
    };
    Alert.alert(
      t('navigation.stopTitle'),
      t('navigation.stopBody'),
      [
        { text: t('navigation.keepGoing'), style: 'cancel', onPress: releaseConfirmation },
        { text: t('navigation.stop'), style: 'destructive', onPress: confirmExit },
      ],
      { cancelable: true, onDismiss: releaseConfirmation },
    );
  }, [exitOnce]);

  const completeArrivalNavigation = exitOnce;

  useEffect(() => {
    if (!active) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (arrived) exitOnce();
      else requestNavigationExit();
      return true;
    });
    return () => subscription.remove();
  }, [active, arrived, exitOnce, requestNavigationExit]);

  return { requestNavigationExit, completeArrivalNavigation };
}
