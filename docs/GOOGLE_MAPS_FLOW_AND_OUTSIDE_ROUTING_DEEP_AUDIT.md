# GOOGLE_MAPS_FLOW_AND_OUTSIDE_ROUTING_DEEP_AUDIT.md

# Karachi Ijtema Offline Navigation
# Google Maps Experience Verification + Routing Correction Plan


## OBJECTIVE

Verify the complete application against Google Maps navigation behavior.

Do not only check UI.

Check:

1. User journey
2. Map states
3. Routing correctness
4. Outside Ijtema routing
5. Gate selection
6. Internal navigation
7. GPS behavior
8. ETA calculation
9. Route visualization


The application should behave like Google Maps:

User opens map

↓

Search/select destination

↓

Preview route

↓

Start navigation

↓

Live navigation


The map remains the primary screen.

No separate directions workflow.


---

# PART 1 — GOOGLE MAPS FLOW VERIFICATION


Verify every state.


## STATE 1

APP START / SPLASH


Expected:

- App loading screen
- Map data initialization
- GPS initialization
- Offline database ready
- Smooth transition


Check:

- blank screen?
- loading stuck?
- map appearing before data ready?


Fix if needed.


---

# STATE 2

MAP HOME


Expected Google Maps behavior:


Visible:

Search bar

Current location

Map controls

Layers

Location button


Verify:


## Search

Should support:

Blocks

Gates

Rastas

Pindal


Selecting destination:

Must stay on map.

Must open route preview bottom sheet.


No new screen.


---

# STATE 3

ROUTE PREVIEW


Match Google Maps.


Should show:


Destination

Distance

ETA

Entry gate information


Example:


Block 6

2111 m

26 min


Outside Ijtema:

"Enter through Gate 15"


Actions:


Start Navigation

Change Start

Clear Route



---

# STATE 4

LIVE NAVIGATION


Verify:


Top:

Turn instruction


Middle:

Map


Bottom:


ETA

Distance

Arrival


Camera:

Follow user


Marker:

Smooth movement


---

# PART 2 — OUTSIDE IJTEMA ROUTING DEEP CHECK


THIS IS THE MOST IMPORTANT SECTION.


Current issue:


Outside users are getting incorrect routes.


Analyze routing pipeline.


Expected:



GPS LOCATION

    ↓

OUTSIDE STREET GRAPH

(OSM road network)

    ↓

GATE SELECTION ENGINE

    ↓

IJTEMA INTERNAL GRAPH

    ↓

DESTINATION

(Block/Rasta/Pindal)



Verify that this separation exists.


---

# OUTSIDE ROUTING TEST CASES


Test multiple GPS positions.


## Case 1

User near Gate 14


Destination:

Block 34


Expected:


Choose Gate 14


Not Gate 20.


---

## Case 2

User near eastern roads


Destination:

Block 6


Expected:


Use closest realistic road approach.


Do not cut through empty land.


---

## Case 3

User far from Ijtema


Expected:


Route should follow:

actual streets


not:


straight line


not:


direct graph connection


---

# ROUTE QUALITY CHECK


For every outside route verify:


## Geometry


Route follows roads.


No:

- diagonal lines
- jumping roads
- empty map crossing


## Distance


Distance should be calculated from:

actual route polyline


not:

air distance


## ETA


ETA should use:

route distance

walking speed


not:


fixed estimates.


---

# GATE SELECTION ENGINE AUDIT


Verify:


How gates are selected?


Check:


- nearest distance
- road accessibility
- gate opening status
- internal graph connectivity


A gate should NOT be selected only by:

nearest GPS distance.


It should consider:



outside road cost

gate transition cost

inside walking cost



Example:


Gate A:

500m away

but unreachable


Gate B:

900m away

connected


Choose Gate B.


---

# PART 3 — GOOGLE MAPS ROUTE VISUALIZATION


Verify:


Route line:


Should:

- follow roads
- have clean start point
- connect to user marker
- connect to destination


Colors:


Outside:

Google Maps style route


Inside:

Ijtema route


Markers:


Current location

Gate

Destination


---

# PART 4 — GPS TRACKING


Test:


Moving user:


Walking


Expected:


Marker moves smoothly.


Camera follows.


Route updates if user deviates.


---

# PART 5 — OFFLINE BEHAVIOR


Disable internet.


Verify:


Outside routing:

Uses downloaded street graph.


Inside routing:

Uses internal graph.


No API dependency.


---

# PART 6 — IMPLEMENTATION TASKS


After audit:


Do not create more documentation.


Fix code.


Priority order:


1. Fix outside routing architecture

2. Fix gate selection algorithm

3. Fix route geometry

4. Fix ETA calculation

5. Fix Google Maps bottom sheet flow

6. Fix navigation mode


---

# AGENT DISTRIBUTION


Agent 1:

Navigation architect

Review routing pipeline.


Agent 2:

GIS engineer

Review OSM graph and gate connection.


Agent 3:

React Native engineer

Fix Google Maps UI states.


Agent 4:

QA engineer

Run emulator scenarios.


Agents must coordinate.

Do not duplicate work.


---

# FINAL REPORT


Only after implementation:

Provide:

- what was broken
- what was fixed
- files changed
- emulator tests performed
- remaining issues


Do not claim success without device verification.