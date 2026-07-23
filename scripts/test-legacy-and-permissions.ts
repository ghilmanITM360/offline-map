import { strict as assert } from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';

// Production stabilization pass — Task 3 (legacy code safety) and Task 4 (VIBRATE
// permission cleanup). Guards against these two documentation-backed fixes silently
// regressing (the deprecation tag being removed without deleting the dead code, or the
// unattributed permission reappearing in the checked-in native manifest).

const snapToRoadService = readFileSync('src/services/SnapToRoadService.ts', 'utf8');

assert(
  /@deprecated Unused — no call sites in src\/[\s\S]*?static snapToRoad\(coord: Coordinate\): Coordinate \{/.test(snapToRoadService),
  'SnapToRoadService.snapToRoad must stay marked @deprecated (confirmed dead — no call sites) rather than being silently un-deprecated or deleted without updating docs/LEGACY_NAVIGATION.md.',
);
// The rest of the class must stay untouched — it's live v1 nav code, not part of this deprecation.
assert(snapToRoadService.includes('static snapVisualToRoad('), 'snapVisualToRoad must remain — it is live, called from v1 NavigationViewModel.');
assert(snapToRoadService.includes('static resolveRoutingNode('), 'resolveRoutingNode must remain — it is live, called from v1 NavigationViewModel.');

assert(existsSync('docs/LEGACY_NAVIGATION.md'), 'docs/LEGACY_NAVIGATION.md must exist, documenting which legacy pieces are actually dead vs. still-live v1 code.');
const legacyDoc = readFileSync('docs/LEGACY_NAVIGATION.md', 'utf8');
assert(legacyDoc.includes('SnapToRoadService.snapToRoad()'), 'docs/LEGACY_NAVIGATION.md must document the specific deprecated function.');
assert(
  legacyDoc.includes('v1') && /not deprecated as a\s+whole/i.test(legacyDoc),
  'docs/LEGACY_NAVIGATION.md must be explicit that v1 in general is an intentional, still-live rollback path (per CLAUDE.md) — not a blanket deprecation notice future engineers/AI could misread.',
);

// --- Task 4: VIBRATE permission -------------------------------------------------
const manifestPath = 'android/app/src/main/AndroidManifest.xml';
assert(existsSync(manifestPath), 'Checked-in AndroidManifest.xml must exist — this repo commits the native android/ project rather than regenerating it fresh.');
const manifest = readFileSync(manifestPath, 'utf8');
assert(!manifest.includes('android.permission.VIBRATE'), 'VIBRATE must stay removed from the checked-in manifest — it had zero traceable source and zero code usage (Vibration/Haptics absent from src/).');
// Permissions with confirmed live usage must not be collaterally removed by the same cleanup.
assert(manifest.includes('android.permission.ACCESS_FINE_LOCATION'), 'ACCESS_FINE_LOCATION must remain — required by GPSManagerService/LocationAccessService.');
assert(manifest.includes('android.permission.READ_EXTERNAL_STORAGE'), 'READ_EXTERNAL_STORAGE must remain — required by OfflineMapService (expo-file-system).');
assert(manifest.includes('android.permission.WRITE_EXTERNAL_STORAGE'), 'WRITE_EXTERNAL_STORAGE must remain — required by DownloadMapViewModel (expo-file-system).');

assert(existsSync('docs/ANDROID_PERMISSIONS.md'), 'docs/ANDROID_PERMISSIONS.md must exist, tracking each permission\'s source and justification.');
const permissionsDoc = readFileSync('docs/ANDROID_PERMISSIONS.md', 'utf8');
assert(permissionsDoc.toLowerCase().includes('vibrate'), 'docs/ANDROID_PERMISSIONS.md must record the VIBRATE removal for future audits.');
assert(
  permissionsDoc.includes('AndroidManifest.xml') && permissionsDoc.includes('app.json'),
  'docs/ANDROID_PERMISSIONS.md must explain that the checked-in AndroidManifest.xml, not app.json, is ground truth — the two can silently diverge in this repo.',
);

console.log('Legacy-code and Android-permissions checks passed.');
