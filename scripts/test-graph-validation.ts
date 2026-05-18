import { strict as assert } from 'node:assert';
import { IJTEMA_DATA } from '../src/constants/data';
import { validateIjtemaGraph } from '../src/data/ijtema/validation';

const result = validateIjtemaGraph(IJTEMA_DATA);
assert(result.isValid, `Graph validation failed:\n${result.errors.join('\n')}`);
assert(
  !result.warnings.some((w) => w.toLowerCase().includes('same nearest route node')),
  `Graph validation still has same-nearest-node warnings:\n${result.warnings.join('\n')}`,
);

console.log(`Graph validation passed with ${result.warnings.length} warnings.`);
