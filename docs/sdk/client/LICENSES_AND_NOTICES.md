# Licences and notices

## The SDK package

- The SDK source carries `SPDX-License-Identifier: Apache-2.0` and `package.json` declares `"license": "Apache-2.0"`.
- Apache-2.0 section 4(a) requires that recipients of a redistributed work receive a copy of the licence. The packed tarball therefore contains `LICENSE`, the
  verbatim Apache License 2.0 text: SHA-256 `cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30` (11,358 bytes), identical to
  `https://www.apache.org/licenses/LICENSE-2.0.txt` when it was fetched on 2026-10-27 and to the copies shipped by independent packages already in the tree
  (for example `xcode`). `npm run test:sdk-package` fails if the file differs.
- There is **no `NOTICE` file**, and none is required: Apache-2.0 section 4(d) obliges you to carry forward a NOTICE only when the work you received has one, and this package
  neither embeds third-party Apache-licensed code nor names a copyright holder. No copyright holder or year was invented. If the owner wants one (for example a
  copyright line), add it deliberately; that is an owner decision.
- The package is `"private": true` and unsigned. Delivering the tarball to a client and publishing it to a registry are separate acts; only the first has been prepared.
  See `RELEASE_SIGNING_AND_DISTRIBUTION.md`.

## Third-party software

- The SDK package has no runtime dependencies. React, React Native and `@maplibre/maplibre-react-native` are peer dependencies supplied by the host app and keep their own licences.
- `docs/DEPENDENCY_INVENTORY.md` (generated into each delivery bundle from the shipped `package-lock.json`) lists every production package of the sample app with its declared licence,
  source and whether an integrity hash is pinned. It is the JavaScript graph only.
- **Not covered:** native libraries added by CocoaPods and Gradle, the Hermes engine, system fonts and icons. A complete software bill of materials for a shipped app has to be produced
  from that app's own build (`Podfile.lock`, the Gradle dependency report, the Hermes version) and is the host's responsibility. No SPDX/CycloneDX document is claimed here.

## Map and venue data

- The basemap is derived from OpenStreetMap data and carries the required attribution, `© OpenStreetMap contributors`, under the Open Database Licence (ODbL 1.0). Every pack manifest records it and the style links to it; do not remove it.
- The Karachi venue graph, places and gate facts were supplied by the project owner. **The terms under which they may be redistributed to a client are not recorded in the repository and are an owner decision.** Treat the delivery bundle as private until that is settled.
- Gates 18 and 19 are surveyed-only and intentionally unconnected; the packs say so.

## Fonts, icons, translations

- The sample app uses no bundled font files. Urdu and Roman Urdu wording is host-shipped text reused unchanged for 26 of 89 strings and is **pending owner review** (`TRANSLATION_REVIEW.md`).
