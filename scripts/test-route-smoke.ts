import { strict as assert } from 'node:assert';
import { RoutingService } from '../src/services/RoutingService';

const checks = RoutingService.runRouteDiagnostics();
const failed = checks.filter((c) => !c.success);
assert(failed.length === 0, `Route smoke tests failed: ${failed.map((f) => `${f.from}->${f.to}`).join(', ')}`);

console.log(`Route smoke tests passed: ${checks.length} checks.`);
