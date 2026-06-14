import { strict as assert } from 'node:assert';
import { RoutingService } from '../src/services/RoutingService';

process.env.EXPO_PUBLIC_USE_IJTEMA_V2_MAP = 'false';
process.env.EXPO_PUBLIC_USE_IJTEMA_V2_ROUTING = 'false';
process.env.EXPO_PUBLIC_USE_IJTEMA_V2_NAVIGATION = 'false';

const checks = RoutingService.runRouteDiagnostics();
const failed = checks.filter((c) => !c.success);
assert(failed.length === 0, `Route smoke tests failed: ${failed.map((f) => `${f.from}->${f.to}`).join(', ')}`);

console.log(`Route smoke tests passed: ${checks.length} checks.`);
