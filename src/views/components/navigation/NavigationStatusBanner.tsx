import { Text, View } from 'react-native';

import type { MapWarning } from '../../../viewmodels/MapWarningPolicy';
import { navOverlayStyles as styles } from './navOverlayStyles';

export function NavigationStatusBanner({ warning }: { warning: MapWarning | null }) {
  if (!warning) return null;

  if (warning.kind === 'navigation_safety') {
    return (
      <View style={styles.weakGpsBanner}>
        <Text style={styles.weakGpsText}>{warning.message}</Text>
      </View>
    );
  }

  if (warning.kind === 'rerouting') {
    return (
      <View style={styles.rerouteHintBanner}>
        <Text style={styles.rerouteHintText}>{warning.message}</Text>
      </View>
    );
  }

  return (
    <View style={styles.mapUnavailableBanner}>
      <Text style={styles.mapUnavailableText}>{warning.message}</Text>
    </View>
  );
}
