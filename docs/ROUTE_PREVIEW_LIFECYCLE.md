Owner: HomeScreen owns preview dismissal; DirectionsViewModel owns calculation commit lifetime.
Inputs/states: directionsDestination, activePreviewRoute, routePlannerDest, request generation, unmount.
Why: confirmed cancel/back and late async completion previously left or resurrected ROUTE_PREVIEW.
Invariant: confirmed cancellation clears both preview owners; unmounted requests cannot publish route state.
Regression test: HomeScreen and DirectionsViewModelRouteOwnership cover cancel, back, and stale completion.
