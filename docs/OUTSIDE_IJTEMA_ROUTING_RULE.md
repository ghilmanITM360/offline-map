# Outside Ijtema Routing Rule

The v2 Karachi Ijtema data model treats numbered gates as the only official entry and exit points for public routing.

This document defines gate **eligibility** (which gates may ever be offered)
and remains authoritative for that. For *how* the winning gate among
eligible candidates is chosen — "nearest official gate" below means nearest
by complete pedestrian journey cost when a destination is known, not
straight-line-nearest — see `docs/CORE_ROUTING_DECISION.md`.

## Outside User Flow

If user GPS is outside the internal Ijtema walking area:

1. Do not snap directly to an internal rasta, block corner, block center, or graph node.
2. Suggest the nearest routable official entry gate.
3. Allow the user to choose a routable official gate manually.
4. Start the internal Ijtema route from the selected or nearest official gate.
5. Continue from that gate through the internal graph to the destination block, rasta, or gate.
6. Never suggest missing-coordinate gates as routable entry choices.

Flow summary:

Outside user -> nearest official gate -> internal graph -> destination block/rasta/gate

In the current implementation, "nearest official gate" means the connected, routable official gate that minimizes the complete pedestrian journey cost to the user's destination (see `docs/CORE_ROUTING_DECISION.md`) when a destination is known, or straight-line-nearest when it isn't (e.g. the Home banner before a destination is picked).

## Inside User Flow

If user GPS is inside the Ijtema bounds:

1. The app may snap the user to the nearest internal rasta or graph point.
2. The app may route from that snapped internal location to the destination.

Flow summary:

Inside user -> nearest internal rasta/graph node -> destination

## Gate Data Semantics

Every numbered gate is marked `isOfficialEntry: true` and `entryRole: "official_entry_exit"`.

Gates with supplied coordinates may use `routingStatus: "routable"` and `canStartRouteFromOutside: true` only after graph connector verification.

Gates without supplied coordinates use `routingStatus: "missing_coordinate"` and `canStartRouteFromOutside: false`. They must not be used as route starts, nearest-entry suggestions, or normal routable search destinations until verified coordinates are added.

Disconnected gates, including `GATE_03`, `GATE_17`, `GATE_18`, and `GATE_19`, must not start active navigation silently. The user-facing message is:

`This gate needs connector verification before navigation.`

## Current Implementation

V2 outside/inside classification is derived from the v2 source files instead of only using a broad rectangular map bound. Points inside block polygons or close to known v2 rasta/special-route polylines may snap internally. Other points must route through the nearest connected official gate.
