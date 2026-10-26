# Localization, RTL, theme and accessibility

## Language and copy

All text is the host's. `ENGLISH_NAVIGATION_SCREEN_COPY` and `ENGLISH_ROUTE_STEP_COPY` are optional, separate, and the only copy
shipped. **Urdu and Roman Urdu are not shipped**: supply reviewed text through the same `copy` shape (it is type-checked, so a
missing string will not compile). Place names come from your `describePlace`; the SDK handles ids only. Never substitute
unreviewed translations for production Urdu.

## RTL

Pass `isRTL` (from `I18nManager.isRTL`) to both the screen and `createDefaultNavigationTheme({ isRTL })`.

- Layout and text flow mirror; **the map and Recenter keep their physical layout** by design.
- The screen uses `writingDirection` with `textAlign: 'auto'`. Do not add `textAlign: 'left'|'right'` next to an RTL writing
  direction in your own wrappers: Android and iOS both flip it again (the SDK had this bug and fixed it in 0.1.0).
- Default-theme chevrons are drawn, not glyphs, and are pinned `direction: ltr` (U+2039/U+203A are bidi-mirrored, and Android also
  flips a transform's rotation inside an RTL layout). If you replace the theme's icons, keep that property.
- iOS needs `CFBundleLocalizations` listing `ur`; Android honours the device or per-app locale (`supportsRtl`).
- Verified (emulator/simulator): Android API 36 with `ur-PK`, iOS 26.2 with `ur`. Not verified: Roman Urdu, mixed-script strings,
  physical devices.

## Theme

`createDefaultNavigationTheme({ isRTL, colorScheme: 'light' | 'dark', colors?, radius? })` is ready-made, cached per
(direction, scheme), WCAG AA on both palettes (tested). Follow the system with `useColorScheme()`. `userInterfaceStyle:
"automatic"` is set in the example; Android system-dark following additionally needs `expo-system-ui`. **The MapLibre basemap
palette is light only** (`BASEMAP_COLORS`); a dark map is not provided.

## Font scaling and accessibility

- The SDK never disables font scaling. Its `Text` re-keys native iOS text after a Dynamic Type change, which fixes a main-thread
  hang seen with Urdu Nastaliq text on RN 0.81.5 (RN#57512). Use the SDK's `Text` for any text near it.
- Android font scale 2.0: the Manual Guide stacks, nothing clips (emulator). iOS AX5: layout works but the bottom panel takes most of
  the screen and shows about one place (open item).
- Every control has an accessible name and a 48 dp minimum height; status text is announced politely. **Not verified:** VoiceOver and
  TalkBack focus order and announcements on a device (Jest structure checks only).
- Keep the map's accessibility summary and attribution control reachable; the map adapter leaves the native ones in place.
