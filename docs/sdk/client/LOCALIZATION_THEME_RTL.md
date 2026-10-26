# Localization, RTL, theme and accessibility

## Language and copy

All text is the host's. `ENGLISH_NAVIGATION_SCREEN_COPY` and `ENGLISH_ROUTE_STEP_COPY` are optional, separate, and the only copy
shipped. **Urdu and Roman Urdu are not shipped**: supply reviewed text through the same `copy` shape (it is type-checked, so a
missing string will not compile). Place names come from your `describePlace`; the SDK handles ids only. Never substitute
unreviewed translations for production Urdu.

The sample app shows the screen in Urdu (right to left) and Roman Urdu so the layout can be checked, **without inventing any wording**: a string gets Urdu /
Roman Urdu text only where the Ijtema host already ships a message whose English is word for word the same (26 of 88 strings), and every other string stays
English. All of it is listed, with its source, in [TRANSLATION_REVIEW.md](TRANSLATION_REVIEW.md) and is **pending owner review**; reuse of a host string is not
approval for this screen.

## RTL

Pass `isRTL` to both the screen and `createDefaultNavigationTheme({ isRTL })`. It is plain text direction, so a host can change language **at runtime without
restarting**: the sample app's language picker flips it while the trip, the step, the map camera and the pack pin carry on (tested). `I18nManager.isRTL` is only the
first value.

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
"automatic"` is set in the example and Android additionally needs `expo-system-ui` (6.0.9 for Expo 54), which the example installs.
The sample app's **System / Light / Dark** picker calls `Appearance.setColorScheme(null | 'light' | 'dark')`: System hands the decision back to the device (the app
follows a later change), Light and Dark force it. It sets the status-bar style explicitly from the effective scheme, so a forced scheme cannot leave invisible system
icons. The choice lives above the venue and the journey, so it survives navigation and venue switches; it is not persisted (store it if your product should).
The map has a dark palette: `createDefaultNavigationTheme({ colorScheme: 'dark' })` carries `colorScheme` and the screen passes it to the map.

## Font scaling and accessibility

- The SDK never disables font scaling. Its `Text` re-keys native iOS text after a Dynamic Type change, which fixes a main-thread
  hang seen with Urdu Nastaliq text on RN 0.81.5 (RN#57512). Use the SDK's `Text` for any text near it.
- Large text (system scale 1.3 and up): the directory heading scrolls with the list and the Manual Guide / Live controls are pinned under the scrolling content, so the
  places, Previous / Next, End and Exit stay reachable at the largest sizes; headings cap at 1.8x (see [API_REFERENCE.md](API_REFERENCE.md)). `TextInput` is not covered by the
  SDK `Text` re-key, so the search field is re-created on iOS after a text-size change.
- Every control has an accessible name and a 48 dp minimum height; status text is announced politely. **Not verified:** VoiceOver and
  TalkBack focus order and announcements on a device (Jest structure checks only).
- Keep the map's accessibility summary and attribution control reachable; the map adapter leaves the native ones in place.
