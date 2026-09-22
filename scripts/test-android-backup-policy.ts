import { strict as assert } from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';

// Guards #58 (Android backup policy for persisted location). The app's single
// AsyncStorage database (RKStorage) holds lastKnownLocation — a real device coordinate
// that is actively wrong to restore onto a different device — alongside device-specific
// offline-map bookkeeping. Regression here means either file silently disappearing, the
// manifest losing its wiring, or the exclusion path drifting from the actual DB name.

const manifestPath = 'android/app/src/main/AndroidManifest.xml';
assert(existsSync(manifestPath), 'Checked-in AndroidManifest.xml must exist.');
const manifest = readFileSync(manifestPath, 'utf8');
assert(
  manifest.includes('android:dataExtractionRules="@xml/data_extraction_rules"'),
  'Application tag must wire android:dataExtractionRules (API 31+) to the backup exclusion rules — see #58.',
);
assert(
  manifest.includes('android:fullBackupContent="@xml/backup_rules"'),
  'Application tag must wire android:fullBackupContent (API <=30) to the backup exclusion rules — see #58.',
);

const dataExtractionRulesPath = 'android/app/src/main/res/xml/data_extraction_rules.xml';
assert(existsSync(dataExtractionRulesPath), 'data_extraction_rules.xml must exist.');
const dataExtractionRules = readFileSync(dataExtractionRulesPath, 'utf8');
assert(
  (dataExtractionRules.match(/<exclude domain="database" path="RKStorage" \/>/g) || []).length === 2,
  'data_extraction_rules.xml must exclude the RKStorage database from both cloud-backup and device-transfer — it holds lastKnownLocation.',
);

const backupRulesPath = 'android/app/src/main/res/xml/backup_rules.xml';
assert(existsSync(backupRulesPath), 'backup_rules.xml must exist.');
const backupRules = readFileSync(backupRulesPath, 'utf8');
assert(
  backupRules.includes('<exclude domain="database" path="RKStorage" />'),
  'backup_rules.xml must exclude the RKStorage database — it holds lastKnownLocation.',
);

// If AsyncStorage's backing database name ever changes, the exclusion rules above would
// silently stop covering it while still looking correct — this pins the assumption.
const dbSupplierPath = 'node_modules/@react-native-async-storage/async-storage/android/src/main/java/com/reactnativecommunity/asyncstorage/ReactDatabaseSupplier.java';
if (existsSync(dbSupplierPath)) {
  const dbSupplier = readFileSync(dbSupplierPath, 'utf8');
  assert(
    /DATABASE_NAME\s*=\s*"RKStorage"/.test(dbSupplier),
    'AsyncStorage\'s Android database name changed from "RKStorage" — update the backup exclusion path in data_extraction_rules.xml/backup_rules.xml to match, or the location-data exclusion silently stops working.',
  );
}

console.log('Android backup policy checks passed.');
