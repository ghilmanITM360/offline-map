/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Polygon } from 'react-native-maps';

import { V2BlockLayer } from '../../../services/V2MapRenderingService';

interface BlockLayerProps {
  blocks: V2BlockLayer[];
  variant: 'home' | 'nav';
  /** Home-only: true when the "blocks" map filter is active. */
  focused?: boolean;
  onPressBlock?: (blockId: string) => void;
  keyPrefix: string;
}

// Block labels render via MapLabelOverlay (see HomeScreen's mapLabelItems), not as
// Marker children here — see GateLayer.tsx for why (Android marker-snapshot clipping).
function BlockLayerImpl({ blocks, variant, focused = false, onPressBlock, keyPrefix }: BlockLayerProps) {
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
    </>
  );
}

export const BlockLayer = React.memo(BlockLayerImpl);
