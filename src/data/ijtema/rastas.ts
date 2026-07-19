/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Coordinate, Rasta, RastaPoint } from './types';

const c = (lat: number, lng: number): Coordinate => ({ lat, lng });
const pad = (value: number): string => String(value).padStart(2, '0');

const rastaLabel = (number: number) => ({
  en: `Rasta ${pad(number)}`,
  ur: `راستہ ${pad(number)}`,
  romanUrdu: `Rasta ${pad(number)}`,
});

const rastaAliases = (number: number): string[] => [
  `Rasta ${pad(number)}`,
  `Rasta ${number}`,
  `R${number}`,
  `R${pad(number)}`,
  `راستہ ${number}`,
  `راستہ ${pad(number)}`,
];

const pointLabel = (rastaNumber: number, sequence: number) => ({
  en: `Rasta ${pad(rastaNumber)} Point ${pad(sequence)}`,
  ur: `راستہ ${pad(rastaNumber)} پوائنٹ ${pad(sequence)}`,
  romanUrdu: `Rasta ${pad(rastaNumber)} Point ${pad(sequence)}`,
});

const rasta = (number: number, coordinates: Coordinate[]): Rasta => {
  const id = `R${number}` as const;
  const points: RastaPoint[] = coordinates.map((coordinate, index) => {
    const sequence = index + 1;
    const pointId = `${id}-${pad(sequence)}` as const;
    return {
      id: pointId,
      rastaId: id,
      rastaNumber: number,
      sequence,
      coordinate,
      name: pointLabel(number, sequence),
      developerLabel: pointId,
    };
  });

  return {
    id,
    number,
    name: rastaLabel(number),
    points,
    aliases: rastaAliases(number),
    category: 'rasta',
    visual: {
      label: `Rasta ${pad(number)}`,
      strokeKey: `rasta-${pad(number)}`,
      showLabelByDefault: true,
    },
  };
};

export const IJTEMA_RASTAS: Rasta[] = [
  rasta(1, [c(24.970687, 67.000698), c(24.969403, 67.000692), c(24.968415, 67.000667), c(24.967425, 67.000675), c(24.965616, 67.000653)]),
  rasta(2, [c(24.970649, 67.001641), c(24.969408, 67.001633), c(24.968416, 67.001626), c(24.967421, 67.001621), c(24.965668, 67.001606)]),
  rasta(3, [c(24.970664, 67.002703), c(24.969405, 67.002707), c(24.968401, 67.002693), c(24.967417, 67.002692), c(24.965703, 67.002666)]),
  rasta(4, [c(24.970633, 67.003971), c(24.969401, 67.003945), c(24.968411, 67.003937), c(24.96742, 67.00393), c(24.965669, 67.003931), c(24.964789, 67.003884), c(24.964295, 67.003895)]),
  rasta(5, [c(24.970642, 67.004876), c(24.969411, 67.004862), c(24.968403, 67.004877), c(24.967418, 67.004854), c(24.965658, 67.004845), c(24.964783, 67.004827), c(24.96366, 67.004828)]),
  rasta(6, [c(24.974873, 67.006427), c(24.972548, 67.006467), c(24.970634, 67.006356), c(24.969388, 67.00639), c(24.968414, 67.006363), c(24.967408, 67.00636), c(24.965645, 67.006356), c(24.964784, 67.006342), c(24.96381, 67.006332)]),
  rasta(7, [c(24.974941, 67.007173), c(24.973353, 67.007182), c(24.972525, 67.007165), c(24.97088, 67.007197)]),
  rasta(8, [c(24.974922, 67.008914), c(24.973363, 67.008938), c(24.972538, 67.008935)]),
  rasta(9, [c(24.969422, 66.998058), c(24.969408, 66.999141), c(24.969395, 67.000671), c(24.969399, 67.001611), c(24.969399, 67.002709), c(24.969401, 67.003933), c(24.969408, 67.004853), c(24.969386, 67.006383), c(24.96937, 67.008337)]),
  rasta(10, [c(24.968422, 67.000736), c(24.968409, 67.00163), c(24.968402, 67.002655), c(24.968421, 67.003903), c(24.968399, 67.004863), c(24.9684, 67.006367), c(24.968388, 67.007894)]),
  rasta(11, [c(24.967447, 66.998185), c(24.967448, 66.999085), c(24.967425, 67.000651), c(24.967418, 67.001596), c(24.967428, 67.002677), c(24.967435, 67.003917), c(24.967425, 67.00484), c(24.967416, 67.006344), c(24.967371, 67.007893)]),
];
