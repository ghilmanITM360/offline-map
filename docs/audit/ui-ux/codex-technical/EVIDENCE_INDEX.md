# Evidence Index

## Provenance

- Canonical source: `integration/ijtema-clean-baseline` at `1599c324b7b5cfc1a0a92b4b1158382d4a7a2b81`.
- Evidence branch: `audit/codex-runtime-evidence`.
- Build command: `cd android && ./gradlew assembleRelease -PallowInsecureReleaseSigning=true -PreactNativeArchitectures=arm64-v8a --console=plain`.
- APK SHA-256: `82907c67633a11f73675e11fe5dafeda60af5bbce2ddd8c01a14d0175eb202b2`.
- Signing: Android debug certificate; release-shaped artifact, not production-signed.
- Bundle injection scan: zero matches for `TestLocationInjector`, `scenarioRunner`, or `runtime-location-injection`.
- Historical installed clean APK independently pulled before replacement: SHA-256 `0fffa523955a4213b797a4f124211a0b1be9eb77020839708be3457d4a356b1e`; no injector strings found.

## Screenshots

| File | Content / acceptance |
|---|---|
| `01-launch.png` | Emulator launcher; rejected as application-flow evidence |
| `02-direct-launch.png` | Transitional blank splash after direct activity launch; retained but not used as stable-screen proof |
| `03-directory.png` | Stable Directory |
| `04-map.png` | Stable Home map, offline geometry and map-key warning |
| `05-after-gps-fix.png` | Location unavailable alert after earlier attempt |
| `06-live-gps-attempt.png` | Map after an unsynchronized attempt; not proof of fix delivery |
| `07-controlled-gps-result.png` | Recenter still loading during controlled attempt |
| `07-location-request-active.png` | Interim recenter loading capture; retained as timing evidence only |
| `08-controlled-gps-timeout.png` | Final Location unavailable result |
| `09-drawer.png` | Drawer inventory and version |
| `10-settings.png` | Settings appearance/map/navigation controls |
| `11-settings-permissions.png` | Settings permission and offline-data states |
| `12-help.png` | Help & Support |
| `13-about.png` | About App |
| `14-privacy-link-unavailable.png` | Unconfigured Privacy Policy result |
| `15-app-guide.png` | App Guide |
| `16-directory-current.png` | Directory with recent destinations and category tabs |
| `17-block13-preview.png` | Block 13 preview sheet |
| `18-block13-true-details.png` | True expanded Details state |
| `19-directions-start-options.png` | Directions entry |
| `20-directions-options-expanded.png` | Start-source options |
| `21-manual-start-selection.png` | Manual start mode selected |
| `22-manual-start-picker.png` | Manual picker state |
| `23-manual-start-search.png` | Empty manual-search result after corrected input sequence setup |
| `24-manual-start-result.png` | Valid Gate 13 manual-search result |
| `25-route-preview-manual-gate13.png` | 852 m offline route preview; Start disabled without precise live location |
| `26-cancel-route-confirmation.png` | Cancel Route confirmation |
| `27-cancel-route-result.png` | Stale route-ready UI after confirmed cancel |
| `28-offline-maps.png` | Offline Maps with leaked Block 13 portal sheet |

## UI trees

- `02-direct-launch.xml`: Directory hierarchy.
- `11-settings.xml`: Settings hierarchy.

## Logs

- `location-after-controlled-gps.txt`: Android location providers and event history after the controlled attempt.
- `package-state.txt`: package/version/permissions state.

## Build/test notes

- Gradle: 812 tasks; `BUILD SUCCESSFUL` in 8m10s.
- Build warnings: no production keystore, debug signing; NODE_ENV fallback; dependency/Gradle deprecations.
- Jest: 55 suites, 597 tests passed.
- Full script suite: passed with documented data advisories and Node hydration warnings.

Important evidence is stored in this directory; no credential, API secret or private configuration is included.
