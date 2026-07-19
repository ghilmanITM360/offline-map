/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Text, View } from 'react-native';
import { Marker, Polygon } from 'react-native-maps';

import { MapLocalizationService } from '../../../services/MapLocalizationService';
import { V2BlockLayer } from '../../../services/V2MapRenderingService';
import { mapLayerStyles as styles } from './mapLayerStyles';

interface BlockLayerProps {
  blocks: V2BlockLayer[];
  /** Home-only: labels are not rendered during navigation. */
  labels?: V2BlockLayer[];
  variant: 'home' | 'nav';
  /** Home-only: true when the "blocks" map filter is active. */
  focused?: boolean;
  /** Home-only: suppresses tracksViewChanges thrash mid label-LOD transition — see GateLayer. */
  transitioning?: boolean;
  onPressBlock?: (blockId: string) => void;
  keyPrefix: string;
}

function BlockLayerImpl({ blocks, labels = [], variant, focused = false, transitioning = false, onPressBlock, keyPrefix }: BlockLayerProps) {
  if (variant === 'nav') {
    return (
      <>
        {blocks.map((block) => (
          <Polygon
            key={`${keyPrefix}_${block.id}`}
            coordinates={block.polygon}
            fillColor={block.isSelected ? 'rgba(46,125,50,0.26)' : 'rgba(46,125,50,0.08)'}
            strokeColor={block.isSelected ? '#2E7D32' : 'rgba(95,99,104,0.45)'}
            strokeWidth={block.isSelected ? 2.5 : 1}
            zIndex={4}
          />
        ))}
      </>
    );
  }

  return (
    <>
      {blocks.map((block) => (
        <Polygon
          key={`${keyPrefix}_${block.id}`}
          coordinates={block.polygon}
          fillColor={block.isSelected ? 'rgba(26,115,232,0.42)' : focused ? 'rgba(46,125,50,0.30)' : 'rgba(46,125,50,0.14)'}
          strokeColor={block.isSelected ? '#1A73E8' : focused ? '#1B5E20' : '#2E7D32'}
          strokeWidth={block.isSelected ? 3 : focused ? 2 : 1.2}
          zIndex={1}
          tappable
          onPress={() => onPressBlock?.(block.id)}
        />
      ))}

      {labels.map((block) => {
        const urduName = MapLocalizationService.getSecondaryLabel(block.name);
        return (
          <Marker
            // Keyed on focused/isSelected, not just block.id — those flags resize
            // the pill (see v2BlockLabelFocused), and react-native-maps Android can
            // keep an already-mounted marker's rasterized bounds frozen at the
            // smaller size, clipping the label. Forcing a remount avoids that (see
            // the identical fix + comment on GateLayer's full-label Marker).
            key={`${keyPrefix}_label_${block.id}_${focused ? 'f' : 'u'}_${block.isSelected ? 's' : 'u'}`}
            coordinate={block.center}
            anchor={{ x: 0.5, y: 0.5 }}
            zIndex={8}
            tracksViewChanges={transitioning}
          >
            <View style={[styles.v2BlockLabel, focused && styles.v2BlockLabelFocused, block.isSelected && styles.v2SelectedBlockLabel]}>
              <Text style={[styles.v2BlockLabelText, focused && styles.v2BlockLabelTextFocused, block.isSelected && styles.v2SelectedBlockLabelText]}>
                {block.label}
              </Text>
              {urduName && (
                <Text style={[styles.v2BlockLabelUrdu, focused && styles.v2BlockLabelUrduFocused, block.isSelected && styles.v2SelectedBlockLabelText]}>
                  {urduName}
                </Text>
              )}
            </View>
          </Marker>
        );
      })}
    </>
  );
}

export const BlockLayer = React.memo(BlockLayerImpl);
