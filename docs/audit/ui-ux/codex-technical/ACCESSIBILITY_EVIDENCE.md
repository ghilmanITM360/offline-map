# Accessibility Evidence

## Runtime evidence collected

- Directory hierarchy: `evidence/ui-trees/02-direct-launch.xml`.
- Settings hierarchy: `evidence/ui-trees/11-settings.xml`.
- Screenshots cover Directory, map, location-unavailable alert, drawer and Settings.
- Stable controls expose native text and clickable nodes in the hierarchy. Settings visibly exposes switch state and permission status.

## Evidence limits

- UIAutomator hierarchy proves discoverable Android nodes and state at capture time. It does not prove spoken TalkBack output.
- TalkBack was not enabled and no spoken-output capture was made. Focus order and auditory announcements are therefore UNVERIFIED.
- `GPS_LOST` live announcement behavior is UNVERIFIED. No active navigation session could be established, and permission was not revoked as a substitute.
- Heading semantics, scaled-font clipping and minimum touch targets were not fully runtime measured.
- Dynamic content descriptions/roles found in source remain SOURCE VERIFIED only until exercised with an accessibility service.

## Source findings

- Map controls define accessibility labels and button state in `MapControls.tsx:47-122`.
- Navigation controls and status regions are defined in `NavigationChromeV1.tsx:33-243` and `NavigationChromeV2.tsx:38-324`.
- Directory rows/tiles provide pressable semantics in `DestinationRow.tsx:33-126` and `DestinationBlockGrid.tsx:14-67`.
- The nav overlay styles note some controls are visually 44–48 px (`navOverlayStyles.ts:10`), placing them at or below Android’s commonly recommended 48 dp target; runtime geometry/overlap still needs direct measurement.

## Current classification

| Area | Classification |
|---|---|
| Native tree presence for Directory/Settings | TRUSTED-BUILD EMULATOR VERIFIED |
| Accessible names/roles in audited source | SOURCE VERIFIED |
| TalkBack speech and focus order | UNVERIFIED |
| GPS lost announcement | ENVIRONMENT BLOCKED |
| Font scale beyond 1.0 | UNVERIFIED |
| Switch enabled/checked state | Partial hierarchy/runtime evidence; full screen-reader behavior UNVERIFIED |
