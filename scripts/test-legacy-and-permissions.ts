import { strict as assert } from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';

// Production stabilization pass — Task 3 (legacy code safety) and Task 4 (VIBRATE
// permission cleanup). Guards against these two documentation-backed fixes silently
// regressing (the deprecation tag being removed without deleting the dead code, or the
// unattributed permission reappearing in the checked-in native manifest).

const snapToRoadService = readFileSync('src/services/SnapToRoadService.ts', 'utf8');

assert(
  /@deprecated Unused — no call sites in src\/[\s\S]*?static snapToRoad\(coord: Coordinate\): Coordinate \{/.test(snapToRoadService),
  'SnapToRoadService.snapToRoad must stay marked @deprecated (confirmed dead — no call sites) rather than being silently un-deprecated or deleted without updating docs/KNOWN_LIMITATIONS_AND_OWNER_ACTIONS.md.',
);
// The rest of the class must stay untouched — it's live v1 nav code, not part of this deprecation.
assert(snapToRoadService.includes('static snapVisualToRoad('), 'snapVisualToRoad must remain — it is live, called from v1 NavigationViewModel.');
assert(snapToRoadService.includes('static resolveRoutingNode('), 'resolveRoutingNode must remain — it is live, called from v1 NavigationViewModel.');

assert(existsSync('docs/KNOWN_LIMITATIONS_AND_OWNER_ACTIONS.md'), 'docs/KNOWN_LIMITATIONS_AND_OWNER_ACTIONS.md must exist, documenting which legacy pieces are actually dead vs. still-live v1 code.');
const legacyDoc = readFileSync('docs/KNOWN_LIMITATIONS_AND_OWNER_ACTIONS.md', 'utf8');
assert(legacyDoc.includes('SnapToRoadService.snapToRoad()'), 'docs/KNOWN_LIMITATIONS_AND_OWNER_ACTIONS.md must document the specific deprecated function.');
assert(
  legacyDoc.includes('v1') && /not deprecated/i.test(legacyDoc),
  'docs/KNOWN_LIMITATIONS_AND_OWNER_ACTIONS.md must be explicit that v1 in general is an intentional, still-live rollback path (per AGENTS.md/CLAUDE.md) — not a blanket deprecation notice future engineers/AI could misread.',
);

// --- Task 4: VIBRATE permission -------------------------------------------------
const manifestPath = 'android/app/src/main/AndroidManifest.xml';
assert(existsSync(manifestPath), 'Checked-in AndroidManifest.xml must exist — this repo commits the native android/ project rather than regenerating it fresh.');
const manifest = readFileSync(manifestPath, 'utf8');
assert(!manifest.includes('android.permission.VIBRATE'), 'VIBRATE must stay removed from the checked-in manifest — it had zero traceable source and zero code usage (Vibration/Haptics absent from src/).');
// Permissions with confirmed live usage must not be collaterally removed by the same cleanup.
assert(manifest.includes('android.permission.ACCESS_FINE_LOCATION'), 'ACCESS_FINE_LOCATION must remain — required by GPSManagerService/LocationAccessService.');
// expo-file-system's own manifest unconditionally declares these; the app only uses its
// app-internal Paths.document API, which needs neither, so they're stripped from the merged
// manifest via tools:node="remove" (see #81) rather than reappearing through autolinking.
assert(
  /<uses-permission android:name="android\.permission\.READ_EXTERNAL_STORAGE" tools:node="remove"\/>/.test(manifest),
  'READ_EXTERNAL_STORAGE must be explicitly removed via tools:node="remove" — deleting the line alone lets expo-file-system\'s own manifest re-add it via autolinking.',
);
assert(
  /<uses-permission android:name="android\.permission\.WRITE_EXTERNAL_STORAGE" tools:node="remove"\/>/.test(manifest),
  'WRITE_EXTERNAL_STORAGE must be explicitly removed via tools:node="remove" — deleting the line alone lets expo-file-system\'s own manifest re-add it via autolinking.',
);

assert(existsSync('docs/RELEASE_SECURITY_PRIVACY.md'), 'docs/RELEASE_SECURITY_PRIVACY.md must exist, tracking each permission\'s source and justification.');
const permissionsDoc = readFileSync('docs/RELEASE_SECURITY_PRIVACY.md', 'utf8');
assert(permissionsDoc.toLowerCase().includes('vibrate'), 'docs/RELEASE_SECURITY_PRIVACY.md must record the VIBRATE removal for future audits.');
assert(
  permissionsDoc.includes('AndroidManifest.xml') && permissionsDoc.includes('app.json'),
  'docs/RELEASE_SECURITY_PRIVACY.md must explain that the checked-in AndroidManifest.xml, not app.json, is ground truth — the two can silently diverge in this repo.',
);

console.log('Legacy-code and Android-permissions checks passed.');
