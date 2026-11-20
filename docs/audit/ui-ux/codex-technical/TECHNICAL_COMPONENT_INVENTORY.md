# Technical Component Inventory

Baseline: `1599c324b7b5cfc1a0a92b4b1158382d4a7a2b81`.

| Component | Source | Render condition / responsibility | Direct tests |
|---|---|---|---|
| CustomDrawer | `src/views/components/CustomDrawer.tsx:27-200` | Nested drawer content; Home, Offline Maps, Settings, Help, About and download status | No rendered component test found |
| LocationSheet | `src/views/components/map/LocationSheet.tsx:133-1242` | Discriminated modes: preview, details, directions, routePreview; includes start options, loading/failure, route summary/actions | `LocationSheet.test.tsx`; route/directions scripts |
| LayersSheet | `src/views/components/map/LayersSheet.tsx:54-190` | Modal when `layersSheetVisible` | `LayersSheet.test.tsx` |
| LocationTutorialTooltip | `src/views/components/map/LocationTutorialTooltip.tsx:24-58` | Conditional first-use location hint, auto-dismisses | No direct test found |
| MapControls | `src/views/components/map/MapControls.tsx:47-122` | Layers, compass, zoom, optional recenter; recenter has idle/loading/success/failure/active states | Script coverage; no direct Jest render test |
| BlockLayer | `src/views/components/map/BlockLayer.tsx:26-62` | V2 block polygons, selection callback | Script/source coverage |
| GateLayer | `src/views/components/map/GateLayer.tsx:35-70` | V2 gate markers/polygons, selection callback | Script/source coverage |
| RastaLayer | `src/views/components/map/RastaLayer.tsx:30-104` | V2 rasta geometry and selection | Script/source coverage |
| SpecialRouteLayer | `src/views/components/map/SpecialRouteLayer.tsx:27-79` | Special-route geometry and selection | Script/source coverage |
| FacilityLayer | `src/views/components/map/FacilityLayer.tsx:46-73` | Facilities and selection | Script/source coverage |
| MapLabelOverlay | `src/views/components/map/MapLabelOverlay.tsx:160-302` | Projected labels, decluttering and hit targets | `MapLabelOverlay.test.tsx`; scripts |
| UserLocationMarker | `src/views/components/map/UserLocationMarker.tsx:39-141` | Live/remembered position, accuracy, heading and follow visual state | No direct rendered test found |
| VenueBoundary | `src/views/components/map/VenueBoundary.tsx:11-21` | Venue polygon | Indirect scripts |
| SatelliteDimOverlay | `src/views/components/map/SatelliteDimOverlay.tsx:21-32` | Satellite contrast overlay | Script coverage |
| OsmAttribution | `src/views/components/map/OsmAttribution.tsx:11-41` | OSM attribution when OSM geometry/base-map state requires it | `OsmAttribution.test.tsx`; script |
| NavigationChromeV1 | `src/views/components/navigation/NavigationChromeV1.tsx:33-243` | Legacy nav banners, instruction/trip cards, recenter, arrival | `NavigationChromeV1.test.tsx` |
| NavigationChromeV2 | `src/views/components/navigation/NavigationChromeV2.tsx:38-324` | V2 nav GPS state, instructions, trip card, controls, arrival | `NavigationChromeV2.test.tsx` |
| NavigationMapLayersV1/V2 | `src/views/components/navigation/NavigationMapLayersV1.tsx:20-124`; `NavigationMapLayersV2.tsx:22-125` | Route and navigation markers when Navigation/Arrival mode active | Direct Jest tests |
| OutsideRoutePolyline | `src/views/components/navigation/OutsideRoutePolyline.tsx:12-33` | Differentiates road-following versus direct-guide geometry | Direct Jest test |
| OutsideRouteStatusCard | `src/views/components/navigation/OutsideRouteStatusCard.tsx:20-142` | Outside provider/fallback status and retry | Direct Jest test |
| SearchBarField | `src/views/components/common/SearchBarField.tsx:18-48` | Shared text input shell | `SearchBarField.test.tsx` |
| Button / Card / SheetHeader / SheetHandle | `src/views/components/common/` | Shared primitives | Source-contract scripts; limited/no direct render coverage except consumers |
| DestinationBlockGrid | `src/views/components/directory/DestinationBlockGrid.tsx:14-67` | Directory block tiles | Indirect directory test |
| DestinationRow | `src/views/components/directory/DestinationRow.tsx:33-126` | Directory result row with category semantics | `DestinationRow.test.tsx` |
| ErrorBoundary | `src/views/components/ErrorBoundary.tsx` | Catches React render errors and displays recovery UI | No direct test found |

## State ownership trace

- `HomeScreen` renders and forwards actions.
- `HomeViewModel` owns selection and recenter interaction; `DirectionsViewModel` owns route setup/preview; `NavigationViewModelV2` owns active navigation, GPS freshness, reroute and arrival.
- `LocationAccessService.ts:74-186` requests one current fix, enforces a 15-second application timeout, then accepts a device last-known fix only when at most 30 seconds old and at most 50 m accuracy.
- `GPSManagerService.ts:102-153` owns the shared Expo watch and publishes native timestamps through the store/listeners.

## Accessibility source observations

The source contains explicit labels/roles/states in map controls, navigation chrome, directory controls and sheets, but coverage is uneven. Source props do not prove TalkBack speech, focus order, or live announcements. Those remain separate runtime classifications.
